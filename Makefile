# DevZen 常用命令
# 用法：make <目标>，无参数时显示帮助

.PHONY: help install dev build preview typecheck typecheck-node typecheck-web \
        package package-win dist dist-win clean reinstall

# 默认目标：列出可用命令
help:
	@echo "DevZen 可用命令："
	@echo "  make install         安装依赖"
	@echo "  make dev             启动开发模式（electron-vite dev）"
	@echo "  make build           构建主/preload/renderer 三层产物"
	@echo "  make preview         预览构建产物"
	@echo "  make typecheck       全量类型检查（node + web）"
	@echo "  make typecheck-node  仅检查 main/preload"
	@echo "  make typecheck-web   仅检查 renderer"
	@echo "  make package         打包未签名 .app（macOS，--dir）"
	@echo "  make package-win     打包未签名 Windows 版（--dir）"
	@echo "  make dist            打包 dmg/zip 发行版（macOS）"
	@echo "  make dist-win        打包 Windows 安装包"
	@echo "  make clean           清理 out/ 与 dist/"
	@echo "  make reinstall       删除 node_modules 后重装"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

typecheck:
	npm run typecheck

typecheck-node:
	npm run typecheck:node

typecheck-web:
	npm run typecheck:web

package:
	npm run package:mac

package-win:
	npm run package:win

dist:
	npm run dist:mac

dist-win:
	npm run dist:win

clean:
	rm -rf out dist

reinstall:
	rm -rf node_modules package-lock.json
	npm install
