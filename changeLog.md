**修改在此记录**

## 2026-09-30

### CSS 整理

- `cet/style.css`
  - 提取字体和间距变量。
  - 统一夜间模式选择器及代码格式。
  - 删除空规则和重复的 `#back-extra1` 规则。
- `jlpt/style.css`
  - 使用 `transparent` 表达透明背景。
  - 补充夜间模式的辅助文字、边框颜色及 `[data-theme='dark']` 入口。
  - 清理失效注释，统一组合选择器和动态视口规则的格式。
- `ja_grammar/style.css`
  - 提取字体、颜色、圆角和间距变量。
  - 夜间模式改为覆盖变量，减少重复组件规则。
  - 合并 `.num` 与 `.leader` 的公共样式，并将粗体样式限制在卡片内。
  - 统一音频按钮在明暗主题下的颜色来源。

### 暂未处理

- CET 背面的重复 `id="back-extra2"` 需要配合 HTML 修改。
- 三套模板重复的桌宠 CSS/JavaScript 后续可通过构建脚本统一生成。
- JLPT 的 `:has()` 如需兼容旧版 Android WebView，需要配合 HTML 或 JavaScript 调整。
