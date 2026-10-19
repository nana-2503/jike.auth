package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const panProxyTimeout = 10 * time.Minute

type panOpenResp struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func getPanBaseURL(c *gin.Context) (string, error) {
	baseURL := strings.TrimSpace(c.GetHeader("X-Pan-Base-URL"))
	if baseURL == "" {
		baseURL = strings.TrimSpace(c.Query("pan_base_url"))
	}
	if baseURL == "" {
		return "", errors.New("请填写网盘 API 根地址")
	}
	baseURL = strings.TrimRight(baseURL, "/")
	if strings.HasSuffix(baseURL, "/open") {
		baseURL = strings.TrimSuffix(baseURL, "/open")
	}
	parsed, err := url.ParseRequestURI(baseURL)
	if err != nil {
		return "", errors.New("网盘 API 根地址格式不正确")
	}
	switch {
	case parsed.Scheme == "":
		return "", errors.New("网盘 API 根地址需要包含 http:// 或 https://")
	case strings.HasSuffix(parsed.Path, "/api/v1"):
	case parsed.Path == "" || parsed.Path == "/":
		baseURL += "/api/v1"
	default:
		return "", errors.New("网盘 API 根地址应填写站点地址、/api/v1 或 /api/v1/open")
	}
	return baseURL, nil
}

func getPanAPIKey(c *gin.Context) (string, error) {
	apiKey := strings.TrimSpace(c.GetHeader("X-Pan-API-Key"))
	if apiKey == "" {
		apiKey = strings.TrimSpace(c.Query("pan_api_key"))
	}
	if apiKey == "" {
		return "", errors.New("请填写网盘 API Key")
	}
	return apiKey, nil
}

func newPanProxyRequest(c *gin.Context, method, openPath string, query url.Values, body io.Reader, contentType string) (*http.Request, error) {
	baseURL, err := getPanBaseURL(c)
	if err != nil {
		return nil, err
	}
	apiKey, err := getPanAPIKey(c)
	if err != nil {
		return nil, err
	}

	target := baseURL + openPath
	if len(query) > 0 {
		target += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(c.Request.Context(), method, target, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-API-Key", apiKey)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}
	return req, nil
}

func callPanJSON(c *gin.Context, method, openPath string, query url.Values, reqBody interface{}) (panOpenResp, error) {
	var body io.Reader
	contentType := ""
	if reqBody != nil {
		raw, err := json.Marshal(reqBody)
		if err != nil {
			return panOpenResp{}, err
		}
		body = bytes.NewReader(raw)
		contentType = "application/json"
	}

	req, err := newPanProxyRequest(c, method, openPath, query, body, contentType)
	if err != nil {
		return panOpenResp{}, err
	}
	target := req.URL.String()

	resp, err := (&http.Client{Timeout: panProxyTimeout}).Do(req)
	if err != nil {
		return panOpenResp{}, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return panOpenResp{}, err
	}
	var panResp panOpenResp
	if err := json.Unmarshal(raw, &panResp); err != nil {
		snippet := strings.TrimSpace(string(raw))
		if len(snippet) > 160 {
			snippet = snippet[:160] + "..."
		}
		if snippet == "" {
			snippet = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return panOpenResp{}, fmt.Errorf("网盘接口返回异常: %s，HTTP %d，%s", target, resp.StatusCode, snippet)
	}
	if panResp.Message == "" && panResp.Code != 0 {
		panResp.Message = fmt.Sprintf("网盘接口请求失败: HTTP %d", resp.StatusCode)
	}
	if resp.StatusCode == http.StatusNotFound && panResp.Code != 0 {
		panResp.Message = fmt.Sprintf("%s（请求地址：%s）", panResp.Message, target)
	}
	return panResp, nil
}

func writePanJSON(c *gin.Context, panResp panOpenResp) {
	message := panResp.Message
	if message == "" && panResp.Code == 0 {
		message = "ok"
	}
	c.JSON(http.StatusOK, gin.H{
		"code":    panResp.Code,
		"message": message,
		"data":    json.RawMessage(panResp.Data),
	})
}

func writePanProxyError(c *gin.Context, err error) {
	c.JSON(http.StatusOK, gin.H{"code": 1, "message": err.Error(), "data": nil})
}

func panFileQuery(c *gin.Context) url.Values {
	q := url.Values{}
	for _, key := range []string{
		"bucketName", "bucket", "folderId", "folder", "q", "keyword", "page", "pageSize",
		"kind", "fileType", "filterBucket", "tag", "favorite", "minSize", "maxSize", "dateFrom", "dateTo",
	} {
		if value := strings.TrimSpace(c.Query(key)); value != "" {
			q.Set(key, value)
		}
	}
	return q
}

func ListPanFiles(c *gin.Context) {
	resp, err := callPanJSON(c, http.MethodGet, "/open/files", panFileQuery(c), nil)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func CreatePanFolder(c *gin.Context) {
	var req struct {
		Name       string `json:"name"`
		BucketName string `json:"bucketName"`
		ParentID   string `json:"parentId"`
		Inherit    bool   `json:"inherit"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误", "data": nil})
		return
	}
	resp, err := callPanJSON(c, http.MethodPost, "/open/folders", nil, req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func DeletePanFolder(c *gin.Context) {
	resp, err := callPanJSON(c, http.MethodDelete, "/open/folders/"+url.PathEscape(c.Param("id")), nil, nil)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func UploadPanFile(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要上传的文件", "data": nil})
		return
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	if _, err := io.Copy(part, file); err != nil {
		writePanProxyError(c, err)
		return
	}
	for _, field := range []string{"bucketName", "bucket", "folderId", "folder"} {
		if value := strings.TrimSpace(c.PostForm(field)); value != "" {
			_ = writer.WriteField(field, value)
		}
	}
	if err := writer.Close(); err != nil {
		writePanProxyError(c, err)
		return
	}

	req, err := newPanProxyRequest(c, http.MethodPost, "/open/files", nil, &body, writer.FormDataContentType())
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	resp, err := (&http.Client{Timeout: panProxyTimeout}).Do(req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	var panResp panOpenResp
	if err := json.Unmarshal(raw, &panResp); err != nil {
		snippet := strings.TrimSpace(string(raw))
		if len(snippet) > 160 {
			snippet = snippet[:160] + "..."
		}
		writePanProxyError(c, fmt.Errorf("网盘接口返回异常: HTTP %d，%s", resp.StatusCode, snippet))
		return
	}
	writePanJSON(c, panResp)
}

func CreatePanUploadSession(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误", "data": nil})
		return
	}
	resp, err := callPanJSON(c, http.MethodPost, "/open/uploads", nil, req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func GetPanUploadSession(c *gin.Context) {
	resp, err := callPanJSON(c, http.MethodGet, "/open/uploads/"+url.PathEscape(c.Param("uploadId")), nil, nil)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func UploadPanChunk(c *gin.Context) {
	file, header, err := c.Request.FormFile("chunk")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "请选择要上传的分片", "data": nil})
		return
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("chunk", header.Filename)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	if _, err := io.Copy(part, file); err != nil {
		writePanProxyError(c, err)
		return
	}
	if err := writer.Close(); err != nil {
		writePanProxyError(c, err)
		return
	}

	openPath := "/open/uploads/" + url.PathEscape(c.Param("uploadId")) + "/chunks/" + url.PathEscape(c.Param("index"))
	req, err := newPanProxyRequest(c, http.MethodPost, openPath, nil, &body, writer.FormDataContentType())
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	resp, err := (&http.Client{Timeout: panProxyTimeout}).Do(req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	var panResp panOpenResp
	if err := json.Unmarshal(raw, &panResp); err != nil {
		snippet := strings.TrimSpace(string(raw))
		if len(snippet) > 160 {
			snippet = snippet[:160] + "..."
		}
		writePanProxyError(c, fmt.Errorf("网盘接口返回异常: HTTP %d，%s", resp.StatusCode, snippet))
		return
	}
	writePanJSON(c, panResp)
}

func CompletePanUpload(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		req = map[string]interface{}{}
	}
	resp, err := callPanJSON(c, http.MethodPost, "/open/uploads/"+url.PathEscape(c.Param("uploadId"))+"/complete", nil, req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func CancelPanUpload(c *gin.Context) {
	resp, err := callPanJSON(c, http.MethodDelete, "/open/uploads/"+url.PathEscape(c.Param("uploadId")), nil, nil)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func DeletePanFile(c *gin.Context) {
	resp, err := callPanJSON(c, http.MethodDelete, "/open/files/"+url.PathEscape(c.Param("id")), nil, nil)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func DownloadPanFileContent(c *gin.Context) {
	req, err := newPanProxyRequest(c, http.MethodGet, "/open/files/"+url.PathEscape(c.Param("id"))+"/content", nil, nil, "")
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	resp, err := (&http.Client{Timeout: panProxyTimeout}).Do(req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	defer resp.Body.Close()

	for _, header := range []string{"Content-Type", "Content-Length", "Content-Disposition", "Accept-Ranges", "Content-Range"} {
		if value := resp.Header.Get(header); value != "" {
			c.Header(header, value)
		}
	}
	c.Status(resp.StatusCode)
	_, _ = io.Copy(c.Writer, resp.Body)
}

func GetPanDirectLink(c *gin.Context) {
	resp, err := callPanJSON(c, http.MethodPost, "/open/files/"+url.PathEscape(c.Param("id"))+"/direct-link", nil, gin.H{})
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func CreatePanFileShare(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		req = map[string]interface{}{}
	}
	resp, err := callPanJSON(c, http.MethodPost, "/open/files/"+url.PathEscape(c.Param("id"))+"/share", nil, req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func CreatePanShare(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误", "data": nil})
		return
	}
	resp, err := callPanJSON(c, http.MethodPost, "/open/shares", nil, req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func ListPanShares(c *gin.Context) {
	q := url.Values{}
	for _, key := range []string{"page", "pageSize"} {
		if value := strings.TrimSpace(c.Query(key)); value != "" {
			q.Set(key, value)
		}
	}
	resp, err := callPanJSON(c, http.MethodGet, "/open/shares", q, nil)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func UpdatePanShare(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"code": 1, "message": "参数错误", "data": nil})
		return
	}
	resp, err := callPanJSON(c, http.MethodPut, "/open/shares/"+url.PathEscape(c.Param("token")), nil, req)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}

func DeletePanShare(c *gin.Context) {
	resp, err := callPanJSON(c, http.MethodDelete, "/open/shares/"+url.PathEscape(c.Param("token")), nil, nil)
	if err != nil {
		writePanProxyError(c, err)
		return
	}
	writePanJSON(c, resp)
}
