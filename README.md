# Anki 模板

三套带桌宠的 Anki 模板：CET 英语词汇、JLPT 日语词汇、日语语法。中文内容只保留简体中文，字段名沿用原牌组。

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

跨翻面、换卡常驻的源码评估和实施方案见 [桌宠复习会话常驻方案](docs/pet-reviewer-feasibility.md)，包含新旧学习屏差异、滚动避让和后续官方版本合并成本。

全局桌宠的后续行为规划见 [桌宠行为与边框交互](docs/pet-reviewer-behavior.md)，包含评分飞过、同卡停留提醒、双击收起、边框拖动和再次出现设置。设置入口、可自定义参数、媒体分组列表与独立文件路径见 [桌宠设置与媒体方案](docs/pet-reviewer-settings.md)。以下仍描述当前模板已实现的行为。

三套模板内置同一套桌宠功能，默认开启，不需要额外安装附加组件。使用前请将启用列表中的 GIF 放入 `collection.media`，并同步到各设备；桌宠出现时会从这些 GIF 中随机选取一张。默认使用七个 `_aemeath_*.gif`，完整文件名在 `src/shared/pet-config.json` 中。前导下划线是文件名的一部分。若要添加新的桌宠媒体文件，可在`pets`的值中添加新的对象，格式与已有的相同，通过`enabled`字段启用对应对象。这些媒体文件被 Git 忽略，需要自行保留或准备。

- 在当前正面或背面停留约 15 秒，桌宠会从屏幕边缘飞入，尝试找到空位停留。计时从该面的初始化开始，不会因普通点击而重新计时。
- 每次显示背面时，另有 10% 的概率出现一次路过动画：桌宠穿过屏幕后消失，不会停留。
- 点击已经停留的桌宠，它会重新寻找位置并移动；目前不支持拖拽。定位会尝试避让主要文字和音频按钮，但空位不足时仍可能遮挡内容，可尝试点击让它换位置。
- 翻面或换到下一张时，旧桌宠、动画和计时器会被清理，新页面重新计时。

在 `src/shared/pet-config.json` 中调整开关和动画行为，在 `src/shared/pet.css` 中调整尺寸：

| 设置 | 默认值 | 作用 |
| --- | --- | --- |
| `enabled` | `true` | 桌宠总开关；设为 `false` 关闭所有桌宠。 |
| `idleMs` | `15000` | 停留多久后出现驻留桌宠，单位为毫秒。 |
| `flyChance` | `0.1` | 显示背面时的路过概率；设为 `0` 关闭路过动画。 |
| `duration` | `2` | 移动动画时长，单位为秒，不改变 GIF 自身的播放速度。 |
| `--pet-size` | `130px` | 桌宠显示区域的宽度和高度，在 CSS 中修改。 |

替换图片时，修改 `pets` 中相应组的 `files` 文件名列表，并将新文件放入媒体目录；组内的 `enabled` 可以单独禁用该组。没有启用的图片组，或所有启用组的 `files` 均为空时，不会创建桌宠；媒体文件缺失或未同步时，图片无法正常显示。

修改配置或尺寸后运行 `npm run build`，再将需要使用的模板正面、背面和 CSS 一起替换到 Anki。以上共享设置会影响三套模板；只修改源码不会改变已粘贴到 Anki 的版本。桌宠不显示时，先核对总开关、组开关、文件名和媒体同步，再确认是否停留足够时间。

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
  shared/       字体、基础变量、桌宠配置、卡片生命周期和桌宠实现
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

- `src/shared/pet-config.json`：桌宠总开关、图片列表、停留时长、飞行概率和动画时长。
- `src/shared/pet.css`：`--pet-size` 是桌宠尺寸的唯一来源，JavaScript 会读取此值。
- `src/jlpt/config.json`：正面汉字/假名显示、例句范围、背面播放和按设备自动复制开关。
- `src/shared/tokens.css`：字体栈和基础间距；保留日文编号与 KleeOne 展示文字各自的字体优先级。
- 各模板的 `card.css`：模板自身的布局和明暗主题颜色。

修改设置也需要重新构建，再将更新后的成品复制回 Anki。

## 验证

`npm test` 检查生成一致性、JavaScript/CSS 语法、条件字段下的 HTML 结构、重复 ID、缺字段时的例句编号、正反面切换、音频和桌宠清理。

```sh
npm run verify:browser
```

浏览器检查使用本机已安装的 Chrome、Edge 或 Chromium，覆盖三套模板的正反面、明暗主题和两档宽度，并将移动端截图保存到被忽略的 `preview/`。找不到浏览器时，可通过环境变量 `ANKI_BROWSER_PATH` 指定可执行文件路径。此检查使用样例字段，不会操作本机 Anki。

翻面和换卡检查额外使用六倍 CPU 降速并暂停延迟任务：语法模板在初始化前隐藏继承的正面；JLPT 的独立正面与背面同步准备布局，标签和音频按钮准备好后统一显示。检查覆盖“背面→下一张正面”和“正面→下一张正面”，核对首个可见状态的标签以及后续连续帧的位置一致性。嵌入背面的正面脚本仍交给背面初始化去重处理。

Android 和 iOS 的 WebView 仍建议在 Anki 中各试一次：注音、音频按钮、翻面、停留桌宠和夜间模式。

用户本次 AnkiDroid 实测中，字体可观察到先使用默认/后备字体再替换的 `swap` 加载表现，但未出现 PC 测试中的页面整体延迟显示现象。PC 上的 JLPT 翻面延迟原因仍未知，排查暂时搁置；不能据此认定它由字体加载策略引起。避免脚本误触发 MathJax 的正则修正保留，但未解决 PC 上的延迟，详见修改记录。
