package main

import (
	"encoding/json"
	"fmt"
	"time"

	jkauth "jkauth-sdk"
)

// ==================== 配置 ====================
// 以下全部为占位符，请替换为你自己应用管理后台中生成的凭证。
// 获取方式：登录后台 → 应用管理 → 新建应用，拿到 AppCode / AppKey / AppSecret，
// 并按后台展示的「客户端签名算法」「服务端签名算法」模板原样填写。
var config = jkauth.Config{
	BaseURL:        "http://localhost:8081/api/sdk",
	AppCode:        "<your-app-code>",
	AppKey:         "<your-app-key>",
	AppSecret:      "<your-app-secret>", // 启用 AES 加密时填写，为空则明文通讯
	ServerSignAlgo: "<prefix[key]<random-suffix><prefix>[data]<random-suffix>",
	ClientSignAlgo: "<prefix[key]<random-suffix><prefix>[data]<random-suffix>",
	Feature:        "golang-device-001",
	Version:        "1.0.0",
	ClientOS:       "Windows 10",
	MD5:            "",
}

func printResult(name string, resp *jkauth.Response, err error) bool {
	if err != nil {
		fmt.Printf("❌ %s 错误: %v\n", name, err)
		return false
	}
	if resp.Code == 0 {
		fmt.Printf("✅ %s 成功\n", name)
		return true
	}
	fmt.Printf("❌ %s 失败 [%d]: %s\n", name, resp.Code, resp.Message)
	return false
}

func printJSON(label string, data json.RawMessage) {
	var v interface{}
	json.Unmarshal(data, &v)
	b, _ := json.MarshalIndent(v, "   ", "  ")
	fmt.Printf("   %s: %s\n", label, string(b))
}

func main() {
	fmt.Println("=== 极客授权系统 Go SDK 完整功能测试 ===")
	fmt.Println()

	sdk := jkauth.NewClient(config)
	username := fmt.Sprintf("gt%d", time.Now().UnixMilli()%1000000000)
	password := "<your-password>"
	_, _ = username, password

	// ========== 1. 用户注册 ==========
	// fmt.Println("========== 1. 用户注册 ==========")
	// resp, err := sdk.Register(username, password)
	// if !printResult("注册", resp, err) {
	// 	return
	// }
	// var regData struct {
	// 	UserID     uint   `json:"user_id"`
	// 	Username   string `json:"username"`
	// 	InviteCode string `json:"invite_code"`
	// }
	// resp.DataAs(&regData)
	// fmt.Printf("   用户ID: %d\n", regData.UserID)
	// fmt.Printf("   邀请码: %s\n", regData.InviteCode)
	// fmt.Println()

	// ========== 2. 用户登录 ==========
	// fmt.Println("========== 2. 用户登录 ==========")
	// resp, err = sdk.Login(username, password)
	// if !printResult("登录", resp, err) {
	// 	fmt.Println("💡 提示: 如果是计时/计点收费模式，需要先充值")
	// 	return
	// }
	// var loginData struct {
	// 	Token     string `json:"token"`
	// 	ExpireAt  string `json:"expire_at"`
	// 	Points    int    `json:"points"`
	// 	Heartbeat int    `json:"heartbeat"`
	// }
	// resp.DataAs(&loginData)
	// fmt.Printf("   Token: %s\n", loginData.Token)
	// expireStr := loginData.ExpireAt
	// if expireStr == "" {
	// 	expireStr = "未设置"
	// }
	// fmt.Printf("   到期时间: %s\n", expireStr)
	// fmt.Printf("   点数: %d\n", loginData.Points)
	// fmt.Printf("   心跳周期: %d秒\n", loginData.Heartbeat)
	// fmt.Println()

	// ========== 2.1 卡号登录（登录卡） ==========
	// 如需测试卡号登录，取消下方注释并填入登录卡卡号
	// 注意：卡号登录会创建新会话，会覆盖当前登录状态
	// fmt.Println("========== 2.1 卡号登录 ==========")
	// resp, err = sdk.CardLogin("DGCCU5WRJ5IE2GB9")
	// if printResult("卡号登录", resp, err) {
	// 	var cardLoginData struct {
	// 		Token     string `json:"token"`
	// 		UserID    uint   `json:"user_id"`
	// 		Username  string `json:"user"`
	// 		ExpireAt  string `json:"expire_at"`
	// 		Points    int    `json:"points"`
	// 		Heartbeat int    `json:"heartbeat"`
	// 	}
	// 	resp.DataAs(&cardLoginData)
	// 	fmt.Printf("   Token: %s\n", cardLoginData.Token)
	// 	fmt.Printf("   用户ID: %d\n", cardLoginData.UserID)
	// 	fmt.Printf("   用户名: %s\n", cardLoginData.Username)
	// 	ea := cardLoginData.ExpireAt
	// 	if ea == "" { ea = "未设置" }
	// 	fmt.Printf("   到期时间: %s\n", ea)
	// 	fmt.Printf("   点数: %d\n", cardLoginData.Points)
	// 	fmt.Printf("   心跳周期: %d秒\n", cardLoginData.Heartbeat)
	// }
	// fmt.Println()

	// ========== 2.2 试用登录 ==========
	// 如需测试试用登录，取消下方注释
	// 注意：试用登录会创建新的试用用户并登录，会覆盖当前登录状态
	fmt.Println("========== 2.2 试用登录 ==========")
	resp, err := sdk.Trial()
	if printResult("试用登录", resp, err) {
		var trialData struct {
			Token     string `json:"token"`
			Username  string `json:"user"`
			ExpireAt  string `json:"expire_at"`
			Points    int    `json:"points"`
		}
		resp.DataAs(&trialData)
		fmt.Printf("   Token: %s\n", trialData.Token)
		fmt.Printf("   用户名: %s\n", trialData.Username)
		ea := trialData.ExpireAt
		if ea == "" { ea = "已到期" }
		fmt.Printf("   到期时间: %s\n", ea)
		fmt.Printf("   点数: %d\n", trialData.Points)
	}
	fmt.Println()

	// ========== 3. 获取用户信息 ==========
	fmt.Println("========== 3. 获取用户信息 ==========")
	resp, err = sdk.GetUserInfo()
	if printResult("获取用户信息", resp, err) {
		var userInfo struct {
			UserID     uint   `json:"user_id"`
			Username   string `json:"user"`
			ExpireAt   string `json:"expire_at"`
			Points     int    `json:"points"`
			IsPaid     int    `json:"is_paid"`
			Channels   int    `json:"channels"`
			Features   int    `json:"features"`
			InviteCode string `json:"invite_code"`
			ExtraData  string `json:"extra_data"`
			CloudData  string `json:"cloud_data"`
		}
		resp.DataAs(&userInfo)
		fmt.Printf("   用户名: %s\n", userInfo.Username)
		fmt.Printf("   用户ID: %d\n", userInfo.UserID)
		fmt.Printf("   点数余额: %d\n", userInfo.Points)
		ea := userInfo.ExpireAt
		if ea == "" {
			ea = "未设置"
		}
		fmt.Printf("   到期时间: %s\n", ea)
		paid := "否"
		if userInfo.IsPaid == 1 {
			paid = "是"
		}
		fmt.Printf("   是否付费: %s\n", paid)
		fmt.Printf("   通道数: %d\n", userInfo.Channels)
		fmt.Printf("   特征数: %d\n", userInfo.Features)
		fmt.Printf("   邀请码: %s\n", userInfo.InviteCode)
	}
	fmt.Println()

	// ========== 3.1 获取附加数据 ==========
	fmt.Println("========== 3.1 获取附加数据 ==========")
	resp, err = sdk.GetExtraData()
	if printResult("获取附加数据", resp, err) {
		var extra struct {
			ExtraData string `json:"extra_data"`
		}
		resp.DataAs(&extra)
		fmt.Printf("   附加数据: %s\n", extra.ExtraData)
	}
	fmt.Println()

	// ========== 3.2 获取/设置云端数据 ==========
	fmt.Println("========== 3.2 设置云端数据 ==========")
	cloudValue := fmt.Sprintf("cloud_test_%d", time.Now().Unix())
	resp, err = sdk.SetCloudData(cloudValue)
	printResult("设置云端数据", resp, err)
	fmt.Println()

	fmt.Println("========== 3.3 获取云端数据 ==========")
	resp, err = sdk.GetCloudData()
	if printResult("获取云端数据", resp, err) {
		var cloud struct {
			CloudData string `json:"cloud_data"`
		}
		resp.DataAs(&cloud)
		fmt.Printf("   云端数据: %s\n", cloud.CloudData)
	}
	fmt.Println()

	// ========== 4. 心跳 ==========
	fmt.Println("========== 4. 发送心跳 ==========")
	resp, err = sdk.Heartbeat()
	if printResult("心跳", resp, err) {
		var hbData struct {
			ExpireAt string `json:"expire_at"`
			Points   int    `json:"points"`
		}
		resp.DataAs(&hbData)
		ea := hbData.ExpireAt
		if ea == "" {
			ea = "未设置"
		}
		fmt.Printf("   到期时间: %s\n", ea)
		fmt.Printf("   点数: %d\n", hbData.Points)
	}
	fmt.Println()

	// ========== 5. 获取版本列表 ==========
	fmt.Println("========== 5. 获取版本列表 ==========")
	resp, err = sdk.GetVersions()
	if printResult("获取版本列表", resp, err) {
		var versions []struct {
			ID          uint   `json:"id"`
			Version     string `json:"version"`
			IsBeta      int    `json:"is_beta"`
			IsDefault   int    `json:"is_default"`
			DownloadURL string `json:"download_url"`
			Changelog   string `json:"changelog"`
			PublishedAt string `json:"published_at"`
		}
		resp.DataAs(&versions)
		fmt.Printf("   版本数量: %d\n", len(versions))
		for i, v := range versions {
			def := "否"
			if v.IsDefault == 1 {
				def = "是"
			}
			beta := "否"
			if v.IsBeta == 1 {
				beta = "是"
			}
			dl := v.DownloadURL
			if dl == "" {
				dl = "未设置"
			}
			fmt.Printf("\n   %d. 版本: %s\n", i+1, v.Version)
			fmt.Printf("      ID: %d\n", v.ID)
			fmt.Printf("      是否默认: %s\n", def)
			fmt.Printf("      是否内测: %s\n", beta)
			fmt.Printf("      下载地址: %s\n", dl)
			fmt.Printf("      发布时间: %s\n", v.PublishedAt)
			if v.Changelog != "" {
				cl := v.Changelog
				if len(cl) > 50 {
					cl = cl[:50] + "..."
				}
				fmt.Printf("      更新日志: %s\n", cl)
			}
		}
	}
	fmt.Println()

	// ========== 6. 获取指定版本信息 ==========
	fmt.Println("========== 6. 获取指定版本信息 ==========")
	resp, err = sdk.GetVersion("1.0.0")
	if printResult("获取指定版本", resp, err) {
		var vInfo struct {
			Version     string `json:"version"`
			DownloadURL string `json:"download_url"`
			Changelog   string `json:"changelog"`
		}
		resp.DataAs(&vInfo)
		fmt.Printf("   版本号: %s\n", vInfo.Version)
		dl := vInfo.DownloadURL
		if dl == "" {
			dl = "未设置"
		}
		fmt.Printf("   下载地址: %s\n", dl)
		fmt.Printf("   更新日志: %s\n", vInfo.Changelog)
	}
	fmt.Println()

	// ========== 7. 获取数据池列表 ==========
	fmt.Println("========== 7. 获取数据池列表 ==========")
	resp, err = sdk.GetDataPools()
	var poolCode string
	if printResult("获取数据池列表", resp, err) {
		var pools []struct {
			ID   uint   `json:"id"`
			Name string `json:"name"`
			Code string `json:"code"`
		}
		resp.DataAs(&pools)
		fmt.Printf("   数据池数量: %d\n", len(pools))
		for i, p := range pools {
			fmt.Printf("   %d. 名称: %s (编码: %s)\n", i+1, p.Name, p.Code)
		}
		if len(pools) > 0 {
			poolCode = pools[0].Code
		}
	}
	fmt.Println()

	// ========== 8. 获取数据池数据项 ==========
	if poolCode != "" {
		fmt.Println("========== 8. 获取数据池数据项 ==========")
		fmt.Printf("   数据池编码: %s\n", poolCode)
		fmt.Println("   尝试获取数据项: test_item")
		resp, err = sdk.GetDataItem(poolCode, "test_item")
		if printResult("获取数据项", resp, err) {
			var item struct {
				Name          string `json:"name"`
				Code          string `json:"code"`
				Content       string `json:"content"`
				ModifyCount   int    `json:"modify_count"`
				ModifiedCount int    `json:"modified_count"`
			}
			resp.DataAs(&item)
			fmt.Printf("   数据名称: %s\n", item.Name)
			fmt.Printf("   数据编号: %s\n", item.Code)
			fmt.Printf("   数据内容: %s\n", item.Content)
			mc := "∞"
			if item.ModifyCount >= 0 {
				mc = fmt.Sprintf("%d", item.ModifyCount)
			}
			fmt.Printf("   修改次数: %d/%s\n", item.ModifiedCount, mc)
		}
		fmt.Println()
	}

	// ========== 9. 写入用户标识数据 ==========
	fmt.Println("========== 9. 写入用户标识数据 ==========")
	testValue := fmt.Sprintf("go_test_value_%d", time.Now().Unix())
	// 第三个参数为过期时间，格式: "2006-01-02 15:04:05"，留空或不传表示永不过期
	resp, err = sdk.SetUserData("test_key", testValue, "2026-12-31 23:59:59")
	if printResult("写入用户数据", resp, err) {
		fmt.Printf("   键名: test_key\n")
		fmt.Printf("   值: %s\n", testValue)
		fmt.Printf("   过期: 2026-12-31 23:59:59\n")
	}
	fmt.Println()

	// ========== 10. 读取用户标识数据 ==========
	fmt.Println("========== 10. 读取用户标识数据 ==========")
	resp, err = sdk.GetUserData("test_key")
	if printResult("读取用户数据", resp, err) {
		var dataList []struct {
			Key      string `json:"key"`
			Value    string `json:"value"`
			ExpireAt string `json:"expire_at"`
		}
		resp.DataAs(&dataList)
		for _, d := range dataList {
			fmt.Printf("   键名: %s\n", d.Key)
			fmt.Printf("   值: %s\n", d.Value)
			ea := d.ExpireAt
			if ea == "" {
				ea = "永不过期"
			}
			fmt.Printf("   过期时间: %s\n", ea)
		}
	}
	fmt.Println()

	// ========== 11. 获取设备列表 ==========
	fmt.Println("========== 11. 获取设备列表 ==========")
	resp, err = sdk.GetDevices()
	if printResult("获取设备列表", resp, err) {
		var devices []struct {
			ID        uint   `json:"id"`
			Feature   string `json:"feature"`
			Remark    string `json:"remark"`
			CreatedAt string `json:"created_at"`
		}
		resp.DataAs(&devices)
		fmt.Printf("   设备数量: %d\n", len(devices))
		for i, d := range devices {
			feat := d.Feature
			if len(feat) > 30 {
				feat = feat[:30] + "..."
			}
			remark := d.Remark
			if remark == "" {
				remark = "无"
			}
			fmt.Printf("   %d. ID: %d  特征: %s  备注: %s\n", i+1, d.ID, feat, remark)
		}
	}
	fmt.Println()

	// ========== 12. 修改密码 ==========
	// fmt.Println("========== 12. 修改密码 ==========")
	// newPassword := "<your-new-password>"
	// resp, err = sdk.ChangePassword(password, newPassword)
	// printResult("修改密码", resp, err)
	// fmt.Println()

	// ========== 13. 使用新密码登录 ==========
	// fmt.Println("========== 13. 使用新密码登录 ==========")
	// sdk.Logout()
	// resp, err = sdk.Login(username, newPassword)
	// printResult("新密码登录", resp, err)
	// fmt.Println()

	// ========== 14. 登出 ==========
	// fmt.Println("========== 14. 用户登出 ==========")
	// resp, err = sdk.Logout()
	// printResult("登出", resp, err)
	// fmt.Println()

	fmt.Println("=== 🎉 完整功能测试完成 ===")
}
