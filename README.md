# Anki 模板

三套 Anki 模板：CET 英语词汇、JLPT 日语词汇、日语语法，分别提供有桌宠和无桌宠两个版本。中文内容只保留了简体中文。

[修改的AnkiDroid](https://github.com/43276/Anki-Android)支持在新学习屏设置全局桌宠，不需要在模板中添加任何无关代码。

## 来源

- JLPT 基于 [anki-jlpt-decks](https://github.com/5mdld/anki-jlpt-decks) 修改。
- 日语语法基于 [Anki 共享牌组 1748349244](https://ankiweb.net/shared/info/1748349244) 修改。
- CET 基于 [Anki 共享牌组 1045914331](https://ankiweb.net/shared/info/1045914331) 修改。

详细修改见 [changeLog.md](changeLog.md)。

## 直接使用

以下目录中的 HTML/CSS 是生成好的完整文件，可以直接复制到 Anki 的卡片模板编辑器。使用模板不需要 Node.js，也不需要额外加载脚本文件。

根目录的 `cet/`、`jlpt/`、`ja_grammar/` 是有桌宠版，由 `npm run build` 生成：

| 模板 | 正面 | 背面 | 样式 |
| --- | --- | --- | --- |
| CET | `cet/front.html` | `cet/back.html` | `cet/style.css` |
| JLPT | `jlpt/ja-zh_front.html` | `jlpt/ja-zh_back.html` | `jlpt/style.css` |
| 日语语法 | `ja_grammar/front.html` | `ja_grammar/back.html` | `ja_grammar/style.css` |

无桌宠版在 `no_pets/` 下：

| 模板 | 正面 | 背面 | 样式 |
| --- | --- | --- | --- |
| CET | `no_pets/cet/front.html` | `no_pets/cet/back.html` | `no_pets/cet/style.css` |
| JLPT | `no_pets/jlpt/ja-zh_front.html` | `no_pets/jlpt/ja-zh_back.html` | `no_pets/jlpt/style.css` |
| 日语语法 | `no_pets/ja_grammar/front.html` | `no_pets/ja_grammar/back.html` | `no_pets/ja_grammar/style.css` |

两组产物共用卡片源码，布局、字体、音频和注音功能一致。有桌宠版额外包含模板桌宠脚本、配置、样式和媒体引用；无桌宠版在构建时完全排除这些内容。

本次重构增加了根类和调整后的 HTML 结构，升级时将同一模板的正面、背面、样式三项一起替换。旧 HTML 与新 CSS 混用会导致部分样式不生效。原有笔记数据和字段不用迁移。

## 媒体依赖

日语词汇和语法模板需要将下面的字体放进 Anki 的 `collection.media`，并同步到使用的设备：

- `_SourceHanSansCN-Medium.otf`：简中思源黑体。
- `_SourceHanSansJP-Medium.otf`：日文思源黑体。
- `_KleeOne_Regular.ttf`：单词等展示文字。

这些自定义字体使用 `font-display: swap`。使用旧学习屏时，加载时可观察到先使用默认/后备字体显示文字，再替换为指定字体的过程。新学习屏使用 Anki 的资源预加载流程，会提前加载 @font-face 字体并缓存，再显示卡片，因此通常看不到旧学习屏的字体替换过程。

字体文件未包含在此仓库中。缺少字体时会回退到后备字体；本仓库的浏览器检查验证字体栈和字号，不能代替 Anki 设备上的字体文件加载检查。


## 桌宠使用说明

默认开启桌宠：在当前正面或背面停留约 15 秒后从屏幕边缘飞入并寻找空位；显示背面时有 10% 概率路过；点击驻留桌宠可换位置；翻面和换卡时清理桌宠、动画与计时器。空位不足时可能遮挡内容，可点击让它换位置。此版本不包含应用桌宠的跨卡常驻、边框交互等功能。

使用时需将 `src/shared/pet-config.json` 中启用组的 `files` 文件放入 Anki 的 `collection.media`，并同步到设备。默认恢复七个 `_aemeath_*.gif` 文件名，前导下划线是文件名的一部分；可在配置中修改总开关 `enabled`、组开关及图片列表、停留时长 `idleMs`、路过概率 `flyChance` 和动画时长 `duration`；尺寸由 `src/shared/pet.css` 的 `--pet-size` 控制，默认 `130px`。修改后运行 `npm run build` 并重新替换 Anki 中的正面、背面和样式。

## 修改与构建

开发与测试建议使用 Node.js 24.15.0 或更新的 24.x 版本；完整兼容范围见 `package.json` 的 `engines`。

```sh
npm ci
npm run build
npm run check
npm run build:no-pets
npm run check:no-pets
npm test
```

修改 `src` 后运行 `npm run build`，生成的九个文件会更新到根目录的 `cet/`、`jlpt/`、`ja_grammar/`。`npm run check` 只核对成品与源码是否一致，发现手动修改或未构建的文件时会报错。已有成品文件被人工修改时，应先把修改同步回源码再构建。

两个构建脚本与使用命令如下，每组生成九个完整 HTML/CSS 文件：

| 版本 | 构建脚本 | 构建命令 | 一致性检查 | 输出目录 |
| --- | --- | --- | --- | --- |
| 有桌宠 | `scripts/build.mjs` | `npm run build` | `npm run check` | 根目录的 `cet/`、`jlpt/`、`ja_grammar/` |
| 无桌宠 | `scripts/build-no-pets.mjs` | `npm run build:no-pets` | `npm run check:no-pets` | `no_pets/cet/`、`no_pets/jlpt/`、`no_pets/ja_grammar/` |

两组构建只更新各自的输出目录。修改共用卡片源码后，运行两组构建命令；修改桌宠源码或配置只需运行有桌宠构建。`npm test` 会检查两组生成一致性和 JavaScript/CSS 语法。

```text
src/
  shared/       字体、基础变量、卡片生命周期，以及仅有桌宠版使用的桌宠模块
  cet/          CET HTML、样式和初始化
  jlpt/         JLPT HTML、样式、设置和初始化
    partials/   生成四组例句的模板片段
  ja_grammar/   语法 HTML、样式和初始化
    partials/   生成十九组例句、五组接续的模板片段
scripts/        构建和浏览器验证
tests/          模板结构、字段缺失、字体及翻页行为检查
cet/            CET 有桌宠成品
jlpt/           JLPT 有桌宠成品
ja_grammar/     日语语法有桌宠成品
no_pets/        无桌宠成品，包含 cet、jlpt、ja_grammar 三个子目录
```

## 调整设置

- `src/shared/pet-config.json`：仅有桌宠版使用，控制桌宠开关、媒体组、停留时长、飞过概率和动画时长。
- `src/shared/pet.css`：仅有桌宠版使用，`--pet-size` 控制桌宠尺寸。
- `src/jlpt/config.json`：正面汉字/假名显示、例句范围、背面播放和按设备自动复制开关。
- `src/shared/tokens.css`：字体栈和基础间距；保留日文编号与 KleeOne 展示文字各自的字体优先级。
- 各模板的 `card.css`：模板自身的布局和明暗主题颜色。

修改设置也需要重新构建，再将更新后的成品复制回 Anki。

## 问题

PC 上的 JLPT 模板翻面存在延迟，原因未知。