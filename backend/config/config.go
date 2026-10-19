package config

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

const jwtSecretLength = 64

const jwtSecretCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// Config 对应根目录 config.yaml。新增顶层配置项时，需要同步：
// 1. 在这里增加字段和 yaml tag；
// 2. 在 defaultConfig/applyDefaults 中补默认值；
// 3. 如需前端初始化页配置，再同步 handlers/auth.go 的 setup 请求结构。
type Config struct {
	Initialized int            `yaml:"initialized"`
	Server      ServerConfig   `yaml:"server"`
	Database    DatabaseConfig `yaml:"database"`
	Redis       RedisConfig    `yaml:"redis"`
	JWT         JWTConfig      `yaml:"jwt"`
	Site        SiteConfig     `yaml:"site"`
}

type ServerConfig struct {
	Port int    `yaml:"port"`
	Mode string `yaml:"mode"`
}

type DatabaseConfig struct {
	Type     string         `yaml:"type"`
	Postgres PostgresConfig `yaml:"postgres"`
	MySQL    MySQLConfig    `yaml:"mysql"`
}

type PostgresConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	DBName   string `yaml:"dbname"`
	SSLMode  string `yaml:"sslmode"`
}

type MySQLConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	DBName   string `yaml:"dbname"`
}

type RedisConfig struct {
	Enable   bool   `yaml:"enable"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

type JWTConfig struct {
	Secret string        `yaml:"secret"`
	Expire time.Duration `yaml:"expire"`
}

type SiteConfig struct {
	Name string `yaml:"name"`
	Logo string `yaml:"logo"`
}

var Cfg *Config

func defaultConfig() *Config {
	// 首次启动没有 config.yaml 时使用这份最小默认配置，只开放安装向导。
	return &Config{
		Initialized: 0,
		Server: ServerConfig{
			Port: 8081,
			Mode: "release",
		},
		JWT: JWTConfig{
			Expire: 168 * time.Hour,
		},
		Site: SiteConfig{
			Name: "极客验证",
		},
	}
}

func applyDefaults(cfg *Config) {
	// 兼容旧配置文件：新增配置项后旧文件没有该字段，这里负责补运行时默认值。
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8081
	}
	if cfg.Server.Mode == "" {
		cfg.Server.Mode = "release"
	}
	if cfg.JWT.Expire == 0 {
		cfg.JWT.Expire = 168 * time.Hour
	}
	if cfg.Site.Name == "" {
		cfg.Site.Name = "极客验证"
	}
}

func Load(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// 配置不存在不是错误，安装向导会在初始化时调用 Save 写入完整配置。
			Cfg = defaultConfig()
			return nil
		}
		return err
	}
	Cfg = defaultConfig()
	if err := yaml.Unmarshal(data, Cfg); err != nil {
		return err
	}
	applyDefaults(Cfg)

	// JWT Secret 不能使用空值或弱格式。检测不合法时自动生成并回写配置文件。
	if !isValidJWTSecret(Cfg.JWT.Secret) {
		secret, err := generateJWTSecret()
		if err != nil {
			return err
		}
		if err := writeJWTSecret(path, data, secret); err != nil {
			return err
		}
		Cfg.JWT.Secret = secret
	}

	return nil
}

func Save(path string) error {
	if Cfg == nil {
		return fmt.Errorf("配置未加载")
	}
	out, err := yaml.Marshal(Cfg)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, out, 0600); err != nil {
		return fmt.Errorf("写入配置失败: %w", err)
	}
	return nil
}

func EnsureJWTSecret() error {
	// 初始化流程写配置前调用，确保保存到磁盘的配置已经包含可用 JWT Secret。
	if Cfg == nil {
		return fmt.Errorf("配置未加载")
	}
	if isValidJWTSecret(Cfg.JWT.Secret) {
		return nil
	}
	secret, err := generateJWTSecret()
	if err != nil {
		return err
	}
	Cfg.JWT.Secret = secret
	return nil
}

func isValidJWTSecret(secret string) bool {
	// 当前实现要求 64 位字母数字，方便 YAML 保存和人工排查，同时避免空密钥。
	if len(secret) != jwtSecretLength {
		return false
	}

	for _, ch := range secret {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
			return false
		}
	}

	return true
}

func generateJWTSecret() (string, error) {
	// 使用 crypto/rand 生成，不使用 math/rand，避免可预测 token 签名密钥。
	secret := make([]byte, jwtSecretLength)
	max := big.NewInt(int64(len(jwtSecretCharset)))

	for i := range secret {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("生成 JWT 密钥失败: %w", err)
		}
		secret[i] = jwtSecretCharset[n.Int64()]
	}

	return string(secret), nil
}

func writeJWTSecret(path string, data []byte, secret string) error {
	// 使用 yaml.Node 修改原文件，尽量保留已有配置结构，只补/替换 jwt.secret。
	var root yaml.Node
	if err := yaml.Unmarshal(data, &root); err != nil {
		return err
	}

	if len(root.Content) == 0 {
		root.Kind = yaml.DocumentNode
		root.Content = []*yaml.Node{{Kind: yaml.MappingNode}}
	}

	doc := root.Content[0]
	if doc.Kind != yaml.MappingNode {
		return fmt.Errorf("配置文件根节点必须是 YAML 对象")
	}

	jwtNode := mappingValue(doc, "jwt")
	if jwtNode == nil {
		jwtNode = &yaml.Node{Kind: yaml.MappingNode}
		doc.Content = append(doc.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "jwt"},
			jwtNode,
		)
	} else if jwtNode.Kind != yaml.MappingNode {
		jwtNode.Kind = yaml.MappingNode
		jwtNode.Tag = ""
		jwtNode.Value = ""
		jwtNode.Content = nil
	}

	secretNode := mappingValue(jwtNode, "secret")
	if secretNode == nil {
		secretNode = &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str"}
		jwtNode.Content = append(jwtNode.Content,
			&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "secret"},
			secretNode,
		)
	}
	secretNode.Kind = yaml.ScalarNode
	secretNode.Tag = "!!str"
	secretNode.Value = secret
	secretNode.Style = yaml.DoubleQuotedStyle

	out, err := yaml.Marshal(&root)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, out, 0600); err != nil {
		return fmt.Errorf("回写 JWT 密钥失败: %w", err)
	}

	return nil
}

func mappingValue(node *yaml.Node, key string) *yaml.Node {
	// YAML 映射节点的 Content 是 key/value 交替排列。
	for i := 0; i+1 < len(node.Content); i += 2 {
		if node.Content[i].Value == key {
			return node.Content[i+1]
		}
	}
	return nil
}
