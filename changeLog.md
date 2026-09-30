**修改在此记录**

## 2026-10-01

### 移除繁体中文支持

- 删除 JLPT 样式中的思源繁体中文字体声明和 `zh-Hant` 字体规则。
- 删除 JLPT 前面模板中的语言切换配置与 `setLang()` 运行时逻辑。
- 删除 `VocabDefTC`、`SentDefTC1` 至 `SentDefTC4` 等繁中字段引用，只保留简体中文内容路径。
- 保留其他模板中的通用 `lang="zh"` 语义标记；它们不包含繁简切换或繁中内容。

## 2026-09-30（字体修复）

- 恢复 `ja_grammar` 中 `.num` 原有的字体优先级：思源日文字体优先，KleeOne 作为后备。
- 此问题由 CSS 变量整理时错误合并两组不同字体栈导致，不需要修改 HTML。

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
