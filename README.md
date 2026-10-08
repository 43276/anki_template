# Anki 模板

三套 Anki 模板：CET 英语词汇、JLPT 日语词汇、日语语法。中文内容只保留简体中文，字段名沿用原牌组。

## 来源

- JLPT 基于 [anki-jlpt-decks](https://github.com/5mdld/anki-jlpt-decks) 修改。
- 日语语法基于 [Anki 共享牌组 1748349244](https://ankiweb.net/shared/info/1748349244) 修改。
- CET 基于 [Anki 共享牌组 1045914331](https://ankiweb.net/shared/info/1045914331) 修改。

详细修改见 [changeLog.md](changeLog.md)。

## 直接使用

以下目录中的 HTML/CSS 是生成好的完整文件，可以直接复制到 Anki 的卡片模板编辑器。使用模板不需要 Node.js，也不需要额外加载脚本文件。

| 模板 | 正面 | 背面 | 样式 |
| --- | --- | --- | --- |
| CET | `cet/front.html` | `cet/back.html` | `cet/style.css` |
| JLPT | `jlpt/ja-zh_front.html` | `jlpt/ja-zh_back.html` | `jlpt/style.css` |
| 日语语法 | `ja_grammar/front.html` | `ja_grammar/back.html` | `ja_grammar/style.css` |

本次重构增加了根类和调整后的 HTML 结构，升级时请将同一模板的正面、背面、样式三项一起替换。旧 HTML 与新 CSS 混用会导致部分样式不生效。原有笔记数据和字段不用迁移。

## 媒体依赖

日语词汇和语法模板需要将下面的字体放进 Anki 的 `collection.media`，并同步到使用的设备：

- `_SourceHanSansCN-Medium.otf`：简中思源黑体。
- `_SourceHanSansJP-Medium.otf`：日文思源黑体。
- `_KleeOne_Regular.ttf`：单词等展示文字。

这些自定义字体使用 `font-display: swap`。根据用户本次 AnkiDroid 实测，加载时可观察到先使用默认/后备字体显示文字，再替换为指定字体的过程。

字体文件未包含在此仓库中。缺少字体时会回退到后备字体；本仓库的浏览器检查验证字体栈和字号，不能代替 Anki 设备上的字体文件加载检查。


## 桌宠使用说明

三套模板已移除自带桌宠的脚本、样式、配置和媒体引用。配套 AnkiDroid 已实现由新学习屏统一管理桌宠的源码，设置入口为“设置 → 新学习屏 → 桌宠”；使用和验证说明见 [应用桌宠说明](../Anki-Android/docs/development/reviewer-pets.md)，系统文件选择器与实际设备体验仍待实机验收。普通卡片模板无需增加桌宠代码或空位传递接口。

升级已有模板时，请将同一模板的正面、背面和样式一起替换，避免旧正面通过 `FrontSide` 把旧桌宠脚本带到新背面。已安装模板不会随本仓库构建自动更新。更新后的模板在 Anki 桌面版、AnkiMobile 等其他客户端也不再自行显示桌宠。

应用桌宠不内置默认素材。需在桌宠媒体页创建自定义媒体组并导入图片、动图或视频，按组启用；文件由应用私有目录独立管理，不使用卡片媒体库中的旧模板 GIF，也不随 Anki 卡片媒体同步。旧桌宠 GIF 无须继续为本模板保留；清理媒体库时请先确认没有其他模板或字段引用这些文件。

源码评估与设计记录见 [桌宠复习会话常驻方案](docs/pet-reviewer-feasibility.md)、[桌宠行为与边框交互](docs/pet-reviewer-behavior.md)和[桌宠设置与媒体方案](docs/pet-reviewer-settings.md)。这些文档记录了应用注入、同卡停留提醒、评分飞过、边框交互和独立媒体管理的设计依据。

## 修改与构建

开发与测试建议使用 Node.js 24.15.0 或更新的 24.x 版本；完整兼容范围见 `package.json` 的 `engines`。

```sh
npm ci
npm run build
npm run check
npm test
```

修改 `src` 后运行 `npm run build`，生成的九个文件会更新到上表目录。`npm run check` 只核对成品与源码是否一致，发现手动修改或未构建的文件时会报错。已有成品文件被人工修改时，应先把修改同步回源码再构建。

```text
src/
  shared/       字体、基础变量和卡片生命周期
  cet/          CET HTML、样式和初始化
  jlpt/         JLPT HTML、样式、设置和初始化
    partials/   生成四组例句的模板片段
  ja_grammar/   语法 HTML、样式和初始化
    partials/   生成十九组例句、五组接续的模板片段
scripts/        构建和浏览器验证
tests/          模板结构、字段缺失、字体及翻页行为检查
cet/            CET 成品
jlpt/           JLPT 成品
ja_grammar/     日语语法成品
```

## 调整设置

- `src/jlpt/config.json`：正面汉字/假名显示、例句范围、背面播放和按设备自动复制开关。
- `src/shared/tokens.css`：字体栈和基础间距；保留日文编号与 KleeOne 展示文字各自的字体优先级。
- 各模板的 `card.css`：模板自身的布局和明暗主题颜色。

修改设置也需要重新构建，再将更新后的成品复制回 Anki。

## 验证

`npm test` 检查生成一致性、JavaScript/CSS 语法、条件字段下的 HTML 结构、重复 ID、缺字段时的例句编号、正反面切换、音频和共享运行时清理，并确认成品不再包含旧桌宠引用。

```sh
npm run verify:browser
```

浏览器检查使用本机已安装的 Chrome、Edge 或 Chromium，覆盖三套模板的正反面、明暗主题和两档宽度，并将移动端截图保存到被忽略的 `preview/`。找不到浏览器时，可通过环境变量 `ANKI_BROWSER_PATH` 指定可执行文件路径。此检查使用样例字段，不会操作本机 Anki。

翻面和换卡检查额外使用六倍 CPU 降速并暂停延迟任务：语法模板在初始化前隐藏继承的正面；JLPT 的独立正面与背面同步准备布局，标签和音频按钮准备好后统一显示。检查覆盖“背面→下一张正面”和“正面→下一张正面”，核对首个可见状态的标签以及后续连续帧的位置一致性。嵌入背面的正面脚本仍交给背面初始化去重处理。

Android 和 iOS 的 WebView 仍建议在 Anki 中各试一次：注音、音频按钮、翻面和夜间模式。应用桌宠的验收在 AnkiDroid 仓库进行。

用户本次 AnkiDroid 实测中，字体可观察到先使用默认/后备字体再替换的 `swap` 加载表现，但未出现 PC 测试中的页面整体延迟显示现象。PC 上的 JLPT 翻面延迟原因仍未知，排查暂时搁置；不能据此认定它由字体加载策略引起。避免脚本误触发 MathJax 的正则修正保留，但未解决 PC 上的延迟，详见修改记录。
