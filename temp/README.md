# JLPT 公式误检测修正测试

本目录包含可直接粘贴到 Anki 的完整测试版 `ja-zh_front.html`、`ja-zh_back.html` 和 `style.css`，保留原字段占位符，不是填入样例数据的页面。正面和背面需要一起替换；独立 CSS 未改变，已有最新版样式可以继续使用。

修改只把 `cleanWord` 中括号的匹配写法改为 Unicode 转义，避免 Anki 扫描整个 HTML 时把 JavaScript 正则误认为数学公式。清理行为、字体、布局、音频和防闪烁逻辑保持原样；笔记字段中的真实数学公式仍会被正常检测。

在项目根目录运行：

```sh
npm run build
npm run build:jlpt-test
npm test
npm run verify:browser
npm run verify:jlpt-anki
```

- `build-jlpt.mjs`：从源码生成本目录的三份完整测试模板，不需要 Anki 安装。
- `jlpt-mathjax.test.mjs`：九项回归测试，包含旧代码误检测对照、清理行为、1000 组固定种子的混合输入、字段与真实公式、高亮和自动复制；`npm test` 会一并运行。
- `verify-jlpt-anki.mjs`：在独立无界面浏览器中加载本机 Anki 的真实 `reviewer.js` 和 MathJax 资源，验证移动/桌面宽度、普通/六倍 CPU 降速、旧正则对照和修正版本，并检查真实公式仍可排版。
- `jlpt-mathjax-report.json`：验证后生成的耗时和加载统计报告，被 Git 忽略。性能数据只作参考，不作为容易波动的通过条件。

真实页面脚本验证默认查找当前机器的 Anki 安装路径；其他机器可设置 `ANKI_WEB_ROOT` 指向包含 `js/reviewer.js` 的 Web 资源目录。找不到 Chrome/Edge/Chromium 时，用 `ANKI_BROWSER_PATH` 指定浏览器。

程序不会修改 Anki 安装或牌组，也不连接正在使用的 Anki。它只验证 Anki 的 JavaScript 页面更新部分，不能代替实际 Qt 界面、附加组件、字体媒体和音频环境的点击到显示测试。确认不会误加载 MathJax，不代表所有翻面延迟都已消除。
