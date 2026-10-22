# 微光快调 · 微信小程序

从现有 `photo-editor.html` 重构的原生微信小程序。使用 WXML、WXSS、JavaScript 和 Canvas 2D，无 WebView。调色由设备上的 Canvas 完成，检测用图片及输入文字通过独立云函数调用微信内容安全服务；检测副本临时存储，检测完成或过期后自动清理。 AI 调色经同意后发送缩略图与描述，通过微信云函数调用 Qwen3.5-Plus。AI 部署步骤见 [AI_SETUP.md](AI_SETUP.md)。

## 导入和运行

1. 打开微信开发者工具，选择「导入项目」，目录选择本 README 所在的项目文件夹。
2. 项目已配置 `miniprogramRoot: miniprogram/`，无需手动更改代码根目录。
3. `project.config.json` 已填写小程序 AppID `wx01334577ba7ffaf5`。真机调试、预览和发布需要该 AppID 对应的账号权限。
4. 使用稳定版开发者工具，基础库建议 3.7.12 或更新版本；项目依赖 Canvas 2D 和 2D OffscreenCanvas。小程序端无需 npm 构建；发布前需按 [内容安全部署说明](CONTENT_SAFETY_SETUP.md) 部署云函数。
5. 点击「编译」，进入微光快调页面，选取一张 JPG/PNG 图片开始使用。
6. 在微信公众平台打开「设置 → 服务内容声明 → 用户隐私保护指引」，声明“选中的照片或视频信息”（用于选择照片进行编辑；AI 调色经同意后发送缩略图至微信云函数及阿里云百炼；并临时上传检测副本至云存储，由微信内容安全服务校验并在完成或过期后清理）、“摄像头”（用于用户主动拍照）、“相册（仅写入）”（用于保存编辑后的图片）和“剪切板 / 读取你的剪切板”（用于复制预设分享码，方便用户分享给好友导入）。保存并生效后重新编译真机调试。代码已接入隐私授权弹窗与指引入口；需在平台后台完成相应配置。

本次未修改已有 HTML。它仍可独立使用。

## 已迁移功能

- 从相册选图或拍照，在小程序内编辑静态图片。
- 曝光、对比度、去灰、高光、阴影、饱和度、色温、色调。
- 清透、冷调夜景、暖色预设，参数横向选择栏及单个滑块。
- 滑块方向判定：轻触不改值，纵向手势不改参数，横向拖动后才调整。
- 画框默认开启，可直接在「画框」标签的小开关控制；参数顺序为图片大小、圆角、阴影、模糊、压暗。
- 底部文字可编辑或留空，采用系统默认字体。
- 查看原图只切换调色效果，画框、文字仍保留。
- 图片双指缩放、单指拖动、双击缩放、铺满宽度、查看全图。
- 调色与画框的统一历史记录，支持撤回、重做、标记、返回任意步骤；新分支不删除旧记录。
- JPG/PNG 导出，格式选择紧邻保存按钮；保存到相册、拒绝授权后的引导及图片预览。

## 与网页版本的适配差异

- 微信 Canvas 导出采用 JPG/PNG，不提供原网页的 WebP 导出选项。
- 预览长边最多 1200 像素。导出重新从原图片读取，预览缩放、平移不影响导出范围。
- 页面不提供导出尺寸选项。默认按原尺寸导出；超过长边 4096 或约 1200 万像素时，自动等比例缩小并直接导出，不弹出尺寸确认。小图片不放大。
- 超过 8000 万像素的输入会拒绝，避免过量内存占用；设备性能和 Canvas 上限不同，仍可能需要使用更小的照片。
- 仍然是静态图片编辑器，不保留 Live Photo 动态片段。HEIC 等格式能否读取取决于微信和设备解码能力，建议先使用 JPG/PNG 验证。
- 历史仅保存在当前页面内存中，换图或关闭页面会清空；不会持久保存用户原图。
- 无需配置服务器请求域名；通过微信云开发调用内容安全服务；选图后后台检测期间可以先编辑，保存只确认原图检测通过，并等待尚未结束的文字检测；文字先预览、检测不通过则恢复，不对最终合成图另行送检。 AI 调色另行发送缩略图和文字描述。

## 代码结构

```text
project.config.json             微信开发者工具项目配置
miniprogram/
  app.js / app.json / app.wxss   应用入口与公共主题
  pages/editor/
    index.wxml                  紧凑编辑面板、画布、隐私弹窗
    index.wxss                  手机布局与样式
    index.js                    微信 API、手势、渲染、导出与相册流程
    index.json                  页面配置
  utils/
    config.js                   参数范围、默认值、预设
    image.js                    像素调色、背景模糊、画框合成
    history.js                  带分支的参数快照与撤回/重做
    view.js                     缩放、移动边界、导出尺寸
scripts/check.js                JS 与 JSON 检查
tests/                         核心算法与页面状态测试
```

`image.js` 通过注入 Canvas 工厂与微信平台解耦；预览和导出共用相同的调色与画框函数。导出时固定参数快照，防止导出过程中产生混合状态。

## 验证

需要 Node.js 18+，无需安装依赖：

```sh
npm test
npm run check
```

此前已通过：16 项自动测试、JavaScript/JSON 检查，以及微信开发者工具附带的 WXML/WXSS 编译器检查。

开发者工具的 CLI 服务端口当前关闭，因此未通过命令行打开模拟器，也未修改该安全设置。尚未完成微信模拟器运行和 iOS/Android 真机验收。导入后建议检查：

- 竖图、横图及手机拍照的方向是否正常，透明 PNG 的导出效果。
- 调色切换、原图对比保留画框、双指缩放及防误触。
- 撤回到旧步骤继续修改、标记步骤、恢复文字和画框状态。
- 首次隐私授权、拒绝后重试、相册权限拒绝及设置后重新保存。
- JPG/PNG 保存、原尺寸导出与大图自动缩小，低内存设备使用较小图片。

## 官方接口资料

- [Canvas 2D](https://developers.weixin.qq.com/miniprogram/dev/component/canvas.html)
- [创建离屏画布](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.createOffscreenCanvas.html)
- [选取图片](https://developers.weixin.qq.com/miniprogram/dev/api/media/video/wx.chooseMedia.html)
- [导出画布](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.canvasToTempFilePath.html)
- [保存到相册](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.saveImageToPhotosAlbum.html)
- [隐私授权](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.onNeedPrivacyAuthorization.html)
- [微信官方 API 类型定义](https://github.com/wechat-miniprogram/api-typings)

## 界面布局

调色和画框面板与 H5 风格对齐：等宽标签页、调色图标加名称、简洁的画框参数按钮、无卡片背景的单滑块，以及同一行的底部文字标签和输入框。保留图片下方独立工具栏，避免 Canvas 遮挡控件；步骤列表维持最新在前及固定宽度星标。

## 自定义预设

新增预设 Tab，支持保存与管理，并可通过预设码分享和导入好友的预设。预设保存在小程序中，不会自动在其他设备间共享。
