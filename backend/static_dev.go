//go:build dev

package main

import "github.com/gin-gonic/gin"

// 调试构建：不嵌入、不挂载 dist，前端请用 Vite 等 dev server（如 npm run dev）访问。
func setupStaticFiles(r *gin.Engine) {}
