# 桌宠在复习会话中常驻：可行性与实施方案

评估日期：2026-10-08。

依据：引用对话“桌宠全局显示改动评估”、本项目源码、本地 AnkiDroid 源码及已生成的后端渲染资源。

模板项目评估版本：`070d8d4`。AnkiDroid：`0c0a878221`，2.25.1，分支 `my-change`；后端依赖为 `0.1.68-anki26.05`。AnkiDroid 工作区另有新学习屏夜间背景等本地变更。

本次是源码评估；下面的改动规模是工程估算，运行效果及设备兼容性需要在实施阶段确认。

本轮补充评估：设置菜单、与新学习屏开关的联动、独立桌宠媒体和几何信息协议。引入应用设置后，推荐完整方案 B 由应用管理启用状态和素材，模板负责当前内容的避让适配；方案 A 继续作为模板内的最小实现路径。

## 结论

**可行。针对本地的新学习屏，优先把现有 JS 桌宠改为同一 WebView 内的常驻组件。** 首先用模板改动实现跨翻面、跨换卡，再用少量 AnkiDroid 宿主代码补齐整个复习界面的空闲计时和前后台通知。

这比引用对话建议的独立原生覆盖层更适合当前版本：新学习屏已经保留宿主页面，正常翻面和换卡只替换 `#qa` 内的 HTML。桌宠节点放在 `#qa` 外，状态放在页面级单例中，即可利用这个已有生命周期。

引用对话中“翻页重新加载页面”的判断适用于本地的旧学习屏。若要求同时支持旧学习屏，独立覆盖层仍是合理方案。

“全局”在本方案中指应用内的复习会话和卡片显示区域。CET、JLPT、日语语法沿用各自的避让规则；其他模板需要注册避让信息，或另行补充通用内容检测。

## 已确认的代码依据

以下路径中的 AnkiDroid 文件位于相邻仓库，链接以两个项目保持目前的目录关系为前提。

| 现象 | 实际代码与含义 |
| --- | --- |
| 新学习屏初始化加载页面 | [CardViewerFragment.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/previewer/CardViewerFragment.kt) 的 `setupWebView()` 调用 `loadDataWithBaseURL()`；`onWebViewRecreated()` 会重新初始化。 |
| 新学习屏翻面和换卡 | [CardViewerViewModel.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/previewer/CardViewerViewModel.kt) 的 `showQuestion()` / `showAnswer()` 通过 `eval` 发出 `_showQuestion(...)` / `_showAnswer(...)`。 |
| 宿主与卡片内容的分界 | [PreviewerHelpers.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/previewer/PreviewerHelpers.kt) 的 `stdHtml()` 创建 `<div id="qa">`。本机打包的 `backend/js/reviewer.js` 中，`_updateQA` 取得这个节点，替换它的 `innerHTML`，重执行其中的脚本。 |
| 现有桌宠已经在卡片节点外 | [pet.js](../src/shared/pet.js) 的 `create()` 将 `.pet` 追加到 `document.body`。正常替换 `#qa` 本身不会删除这个节点。 |
| 桌宠仍被清理的直接原因 | [runtime.js](../src/shared/runtime.js) 在卡片根节点移除或新根节点初始化时执行 `context.dispose()`；[pet.js](../src/shared/pet.js) 在这个 context 上注册了动画取消、节点删除和计时器清理。 |
| 旧学习屏确实重新加载页面 | [AbstractFlashcardViewer.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/AbstractFlashcardViewer.kt) 的 `loadContentIntoCard()` 在展示卡片内容时调用 `loadDataWithBaseURL()`。同一页面的 JS 单例无法跨越这种加载。 |
| 两套界面均存在 | [Reviewer.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/Reviewer.kt) 的 `getIntent()` 根据 `Prefs.isNewStudyScreenEnabled` 选择 `ReviewerFragment` 或旧 `Reviewer`。 |
| 可接入独立宿主脚本 | [ReviewerFragment.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/ui/windows/reviewer/ReviewerFragment.kt) 的 `onLoadInitialHtml()` 已通过 `extraJsAssets` 加载 `scripts/ankidroid-reviewer.js`。 |

后端实际检查文件是 `AnkiDroid/build/intermediates/assets/fullDebug/mergeFullDebugAssets/backend/js/reviewer.js`。它属于构建产物，实施应扩展模板代码或 AnkiDroid 自己的 assets。

## 现有功能可以复用多少

可复用 GIF 文件列表、随机选图、从边缘入场/路过、镜像方向、CSS 关键帧移动、点击换位，以及三套模板的障碍物选择器。[pet-config.json](../src/shared/pet-config.json) 是配置来源，[pet.css](../src/shared/pet.css) 当前以 `130px` 定义尺寸。

现有逻辑与对话描述有三处差异，实施时应明确处理：

1. `idleMs = 15000` 当前表示每个正面或背面初始化后等待 15 秒。普通点击、滚动不会重置计时，因此需要补上真正的“无操作”计时。
2. `flyChance = 0.1` 当前只在背面触发一次路过动画。建议首期保留这个触发点；若改为每次换卡也触发，需明确概率统计事件，避免重复抽取。
3. `blankSpot()` 最多随机尝试 40 个位置，失败后返回右下角。它使用选定元素的矩形避让，没有持续监听滚动，且无法保证找到空位或完全避开内容。

## 方案比较

| 方案 | 适用范围 | 估计改动规模 | 维护成本 |
| --- | --- | --- | --- |
| A：模板中的页面级 JS 单例 | 本地新学习屏，三套已适配模板 | 约 3–5 个源码文件，约 200–400 行 JS/CSS；重新生成九份模板成品 | 无 AnkiDroid 功能补丁；升级时确认宿主仍保留 `#qa` 外的页面 |
| B：A 加复习宿主通知，推荐完整方案 | 新学习屏，精确覆盖原生按钮操作与前后台，并提供应用开关 | 宿主接入约 3–4 个文件、100–200 行；包含本轮新增设置后约 8–10 个应用文件，部分仅为资源声明 | 主要跟进复习页生命周期、宿主 Activity、设置和脚本加载接入 |
| C：独立原生桌宠层，JS 回传几何信息 | 同时支持新旧学习屏，或桌宠尺寸必须独立于页面缩放 | 约 6–10 个应用文件，加模板几何适配；通常约 500–1000 行量级，双界面和设置界面可能继续增加 | 两套复习界面、坐标转换、GIF 解码及触摸分发均需维护 |

文件数不包括文档、后续验证代码和新增设置资源；行数不包括自动生成模板的重复代码。这些范围不是已实现后的统计。

独立透明 WebView 也能支持旧学习屏并复用 GIF/CSS，但还要处理两个 WebView 的触摸路由、缩放和生命周期；在本地新学习屏上，常驻宿主页面已经提供了更直接的实现基础。

## 推荐实现：常驻状态与卡片检测分开

```mermaid
flowchart TD
    A[复习 Activity / Fragment] -->|操作、暂停、恢复| B[页面级 PetSession]
    C[每张卡片的模板脚本] -->|当前根节点、配置、避让规则| B
    C --> D[当前可见内容的矩形检测]
    D -->|障碍矩形与安全位置| B
    B --> E[body 下、qa 外的桌宠节点]
    F[翻面 / 换卡：替换 qa 内容] --> C
```

### 1. 页面级桌宠管理器

新增 `PetSession`，以带版本的 `window.__ankiTemplatePetSession` 单例保存当前媒体、位置、动画取消函数、驻留状态、最后操作时间和会话监听器。现有 `setupPet(context, config, obstacleSelector)` 可以保留为入口，将当前卡片注册到这个管理器。

桌宠节点和它自己的样式放在 `#qa` 外，样式使用专用类名或 ID。卡片更换仍由 `context.dispose()` 清理音频、标签和当前卡片监听器；它只解除本卡片的桌宠适配，不销毁页面级管理器。解除适配要核对卡片实例标识，防止旧卡片的延后清理影响新卡片。

由模板启动时，使用本地宿主特征识别持久页面，例如 `ankiPlatform === 'ankidroid'`、`#qa` 和 `_queueAction` 的存在，并确认复习器特征；方案 B 可在宿主脚本中提供明确的版本/能力标记。其他环境保留各自适用的生命周期，避免把仅用于当前新学习屏的假设扩散到全部客户端。

单例首次创建后，后续卡片脚本只更新适配信息。模板重复执行、背面包含 `FrontSide`、模板版本变化和当前卡片禁用桌宠都要有确定行为。跨不同笔记类型时，当前卡片的启用设置、尺寸及素材列表生效。

上述按卡片读取配置适用于方案 A。采用应用设置的方案 B 时，应用总开关和素材配置优先，模板配置只用于没有应用宿主的兼容模式；卡片只更新自己的几何信息。

### 2. 保留空位检测，补齐失败与更新处理

将 `blankSpot()` 拆为收集障碍物和选择安全位置两个函数。首期继续使用三套模板现有的选择器；传递多个可见矩形及视口信息，或在同一 JS 页面内直接调用检测函数。

检测要过滤隐藏和无尺寸的元素，按实际可见区域裁剪矩形；有内部滚动容器时也考虑其裁剪范围。给障碍物增加小幅安全边距。桌宠当前矩形可用于点击换位时排除旧位置，但在判断“当前位置是否安全”时要排除它自身。

随机尝试失败后返回 `null`。可以增加有限的网格搜索降低漏判，仍找不到时暂时隐藏。视口小于桌宠尺寸时也返回无可用位置。可见状态恢复后再次检查，保留之前的素材和驻留状态。

现有算法对大块容器的判断偏保守。若实机确认长文本中可见空白较多却总找不到位置，再将文字检测细化为行框；首期不用重写全部内容检测。

落点避让可以复用现有移动方式；移动轨迹仍可能短暂经过文字。如果要求动画全程避开文字，需要额外的路径选择或换位时隐藏策略，这属于独立的行为要求。

### 3. 滚动页面的处理

桌宠采用 `position: fixed`，正常滚动时留在视口位置。滚动更新的是内容的障碍矩形。`getBoundingClientRect()` 给出相对视口的位置，并随页面及滚动容器的滚动变化，适合直接重新测量。[MDN：getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)

监听 `document` 捕获阶段的 `scroll`，覆盖卡片内部滚动；另外监听窗口 `resize`、图片 `load/error`、字体加载完成，并对当前卡片使用必要的 `ResizeObserver` / `MutationObserver`。每次卡片更换都重新绑定这些卡片观察器。

合并高频更新；建议先以约 80–120ms 的频率重新测量，再在滚动结束时补一次。当前位置仍安全就保留；与新内容重叠时立即隐藏当前可见桌宠，再选安全位置，避免持续滚动时反复启动两秒动画。滚动停止后恢复驻留，有新操作则同时重置空闲计时。

缩放、软键盘和可视窗口变化还要考虑 `visualViewport` 的宽高、偏移以及 `resize/scroll`。普通 `innerWidth/innerHeight` 在捏合缩放时可能代表布局视口，而不是实际可见区域。[MDN：VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)

同一 WebView 内的显示与检测都使用 CSS 坐标，可复用当前 GIF 显示方式。桌宠会受到页面缩放的影响；如果需要固定物理尺寸，应明确增加缩放补偿，或选择方案 C。

### 4. 翻面与渲染完成

新卡片注册后，使旧几何信息失效，重新检查当前位置。当前驻留桌宠安全时保留；位置失效时换位或隐藏，保留素材和驻留状态。路过动画是否继续可由同一管理器处理，避免每张卡片再生成第二只。

新学习屏的 `onPageFinished()` 主要服务初始加载，不能把它当作每次翻面的完成事件。模板适配应在每面注册 `onShownHook`，并在实际布局稳定后测量；后端的 `_updateQA` 每次都会清空 `onUpdateHook` / `onShownHook` 数组，因此会话启动时只注册一次钩子是不够的。

字体、图片、MathJax 和背面滚动到答案区域可能继续改变布局。渲染完成后的测量要与滚动/尺寸更新共用同一入口；用卡片实例和几何版本丢弃过期的延后回调。

未适配的卡片或错误页面出现时，旧适配失效，桌宠暂时隐藏；不能继续拿上一张卡片的选择器结果做避让。支持任意模板时，再添加独立的通用检测适配器。

### 5. 真正的空闲计时与宿主接入

默认定义为：每次有效用户操作重新等待 `idleMs`；翻面、换卡和手动点击桌宠都算操作。已驻留时继续保留单只桌宠，计时用于管理以后出现机会。程序触发的滚动可以保守地作为计时重置，避免把系统调整布局误判为空闲。

方案 A 可观察页面内的指针、键盘和滚动以及卡片更新。原生顶部菜单、音频操作等事件不一定进入卡片 DOM，因此准确覆盖整个复习界面需要方案 B 的宿主通知。

建议在 `CardViewerActivity` 将用户活动转交当前 `ReviewerFragment`：使用 `onUserInteraction()` 覆盖基本操作，必要时在持续触摸分发中节流补充活动通知。Android 文档明确此回调用于用户交互，但不保证每次触摸移动都触发。[Android：Activity.onUserInteraction](https://developer.android.com/reference/android/app/Activity#onUserInteraction())

键盘事件还应在宿主 `dispatchKeyEvent()` 转交 Fragment 之前记录；本地 `SingleFragmentActivity` 会先交给 Fragment，快捷键被处理后可能跳过 Activity 默认分发，单靠 `onUserInteraction()` 不足以覆盖这些操作。

`ReviewerFragment` 在主线程通过 `SafeWebViewLayout.evaluateJavascript()` 通知常驻管理器。`onStop` 暂停计时和可见动画；`onStart` 恢复后重新测量并重新开始空闲等待。通知应合并，避免触摸移动逐次发送 JS。

宿主脚本由 `ReviewerFragment.onLoadInitialHtml()` 的 `extraJsAssets` 加载，提供能力标记和 `activity/pause/resume` 通知入口。加入应用开关后，应用负责总开关、素材及显示参数，模板提供内容避让规则。页面重建后宿主脚本及模板重新初始化；正常翻面/换卡保留状态。

同一 WebView 保存状态的边界是页面生命周期。当前清单对旋转使用 `configChanges`，常见旋转不一定重建 WebView；主题切换、渲染进程崩溃或应用进程重建仍可能丢失页面单例。首期按新会话初始化；若要求重建后恢复，再在 `SavedStateHandle` 中保存逻辑状态，不保存 DOM 节点或定时器。

### 6. 点击与原生图层

桌宠容器设置为交互目标，例如使用本地手势代码已识别的 `.tappable`，点击事件阻止继续触发卡片操作。当前新学习屏的 `isInteractable()` 会识别这个类；只阻止默认 click 不能完整覆盖其 `touchend` 手势处理。

保留桌宠之外的卡片点击、滚动和音频操作。宿主已有的标记图标、答题反馈、白板和全屏视频属于原生视图，必要时排除它们对应的区域或在这些模式下隐藏桌宠。白板开启时隐藏是首期最简单的处理。

## 设置菜单与新学习屏依赖

本地设置入口 [preference_headers.xml](../../Anki-Android/AnkiDroid/src/main/res/xml/preference_headers.xml) 已有独立的“新学习屏”页面，与“复习”页面并列。推荐首先在 **设置 → 新学习屏** 中增加“复习桌宠”开关，放在“屏幕”分组中；这是页面内的分组，不增加一次菜单跳转。默认关闭，说明为“复习时显示桌宠，需要启用新学习屏”。

只有一个开关时，在现有页面直接展示最简单。若下一步提供选图、导入媒体、尺寸、空闲时长和概率，则新增 **设置 → 新学习屏 → 桌宠** 子页，并将总开关和这些参数集中在子页中。子页可以在新学习屏关闭时浏览，依赖判断发生在点击启用时。

### 开关的联动方式

推荐弹窗说明依赖，提供“开启新学习屏并启用桌宠”和“取消”两个按钮。进入设置或查看桌宠参数时只展示当前状态；用户点击启用并确认后，一次完成两个开关的设置。说明文字可以写为：

> 复习桌宠需要使用新学习屏。是否同时开启新学习屏？

| 方式 | 界面行为 | 代码差异 |
| --- | --- | --- |
| 手动开启新学习屏 | 桌宠开关在依赖未满足时禁用，提示开启页面顶部的新学习屏开关；或显示说明并定位到该开关 | 可以沿用当前批量禁用逻辑，增加提示文字 |
| 点击桌宠后静默同时开启 | 直接写入两个设置，并更新界面 | 额外同步新学习屏开关及全部依赖项的状态 |
| 说明后确认，同时开启，推荐 | 用户点击启用后看见依赖说明，确认后两个开关一起开启 | 与上一项相比增加确认弹窗及取消处理 |

三种方式的渲染器实现相同。差别集中在设置监听器，通常是几十行量级的逻辑，预计不会明显改变项目总体改动规模。若要求立即把一个正在运行的旧复习 Activity 切换成新复习 Fragment，成本会明显上升；首期按设置改变后下一次进入复习选择界面处理。

本地 [ReviewerOptionsFragment.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/preferences/ReviewerOptionsFragment.kt) 的 `setPrefsEnableState()` 会在新学习屏关闭时禁用除主开关和帮助项以外的其他设置。采用可点击的确认方式时，要单独保留桌宠开关或桌宠入口及其所属分组的启用状态，并显示依赖说明；只放开子项而保留祖先分组禁用，仍可能无法点击。其他需要新学习屏的设置继续根据依赖单独禁用。

异步弹窗应使用可返回 `false` 的标准 `Preference.OnPreferenceChangeListener`，在确认之前拦截开关持久化。本地 [PreferenceUtils.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/preferences/PreferenceUtils.kt) 的便捷监听器最终固定返回 `true`，不能直接用于“弹窗之后再决定是否启用”。确认后统一写入偏好、更新两个开关的显示状态，并刷新其他依赖项；直接修改 `Prefs` 不能替代这段界面刷新。

建议用 `reviewerPetEnabled && isNewStudyScreenEnabled` 判断功能是否生效。关闭新学习屏后，保留用户的桌宠偏好并显示“启用新学习屏后恢复”，暂停实际功能；关闭桌宠不会自动关闭新学习屏。这个选择应在开关摘要中清楚显示。

应用设置负责启用状态后，宿主能力标记应在关闭桌宠时也存在，传递 `enabled: false`；模板识别到应用管理模式后，不再回退创建自己的桌宠。否则关闭应用开关后，模板中默认 `enabled: true` 的逐卡片桌宠仍可能出现。若同一总开关也要控制旧学习屏的模板桌宠，则旧宿主同样注入一个管理标记并禁止回退，这增加一处旧宿主脚本接入，具体接入文件在实施时定位。

新增开关预计涉及现有 `preferences_reviewer.xml`、`ReviewerOptionsFragment.kt`、`Prefs.kt`、偏好 key 资源及英文/简中显示文字资源，约 5–6 个文件；其中多个只是资源声明。子页、素材导入和参数编辑属于额外范围。加上设置后，完整方案 B 的应用文件数量预计从约 3–4 个增至约 8–10 个，重复计算已触及的文件后可能略有变化。

## 桌宠媒体的位置

推荐按使用方式存放：

| 媒体来源 | 推荐位置 | 作用与限制 |
| --- | --- | --- |
| 随应用提供的七个 GIF | `AnkiDroid/src/main/assets/pets/aemeath/`，由 `manifest.json` 列出可用文件 | 应用安装后即可显示，与卡片内容无耦合；更新素材需要更新 APK |
| 用户自行选择的图片/动图 | 导入到当前应用 Context 的 `filesDir/reviewer-pets/<petId>/` | 应用独立管理，可更换牌组；Anki 媒体同步不包含这些文件，跨设备迁移需另做导入/导出 |
| 继续兼容现有三套模板的 GIF | `collection.media`，沿用 `_aemeath_*.gif` | 现有脚本和资源处理可以直接复用，也可以随 Anki 媒体同步 |

本轮只读统计本项目 `aemeath/assets` 中的七个 GIF，合计 **1,364,068 字节，约 1.30 MiB**，不是解码后的内存占用，也不是最终 APK 压缩增量。这组素材随应用内置的体积成本较小。用户自定义素材通过系统文件选择器导入应用目录，避免要求用户操作应用私有路径。[Android：应用专属文件](https://developer.android.com/training/data-storage/app-specific)

`collection.media` 可以存放不在笔记字段中引用的静态模板资源。Anki 的检查媒体功能不扫描问答模板，官方要求此类资源以 `_` 开头，以免被当作未使用媒体；现有文件已符合这个约定。[Anki：检查媒体与静态模板资源](https://docs.ankiweb.net/manual/media)

因此，为现有模板继续使用媒体库是合理的最小改动方案。将桌宠作为应用设置中的独立功能时，推荐默认资源放 assets，自定义资源放应用目录；此时它的配置、导入和删除都能独立于牌组管理。保留媒体库作为兼容来源或用户明确选择的来源即可。

### WebView 如何读取独立资源

默认素材可以使用 `file:///android_asset/pets/aemeath/<file>.gif`，与本地宿主脚本加载 assets 的方式一致。

应用私有目录的自定义文件建议增加限定的虚拟 GET 路径，例如 `/reviewer-pets/<petId>/<file>`，在复习 WebView 的资源拦截器中映射到该目录。复用 `ViewerResourceHandler` 或在复习子类中提供专门处理器，校验目录及文件名。现有 `ViewerResourceHandler` 只从卡片媒体目录读取文件，仍需增加这段映射。

本地 `AnkiServer` 当前对 GET 返回未找到，这个路径应由 `shouldInterceptRequest()` 提供媒体响应；不能只把 GIF 放进 `filesDir` 就期望既有服务器自动读取。

## 空位信息如何传递

### 推荐：同一 WebView 直接调用 JS 接口

卡片脚本与常驻桌宠运行在同一个页面，首期不需要把空位传到 Kotlin。应用加载的常驻脚本提供窄接口，例如 `window.AnkiPetHost.updateGeometry(snapshot)`，卡片测量完成后直接调用。应用设置、素材和生命周期进入宿主，卡片只报告内容几何。

有两种数据选择：

- **可见障碍矩形 + 视口信息，首期推荐。** 将现有 `blankSpot()` 中的矩形收集与随机找点拆开；卡片继续提供各模板选择器和矩形，常驻层复用随机找点函数，并能直接判断原位置是否仍安全。
- **已经验证过的候选位置列表。** 卡片根据常驻层提供的实际桌宠尺寸算出多个落点，宿主随机选取。可以同时报告当前位置是否安全，或附带障碍矩形；单独一组新候选点无法判断旧位置能否保留。

候选点比单个“整张卡片总边界框”更合适，后者不能表达分散内容之间的多个空白处。安全矩形列表也可传递，但当前脚本已有随机取点和碰撞检查，改为求出全部安全矩形通常会增加算法工作量。

下方是建议的数据对象示例，字段名属于新接口设计，当前项目尚未实现。`candidates` 可以省略，由常驻层根据 `blockedRects` 选点：

```js
window.AnkiPetHost?.updateGeometry({
  version: 1,
  renderId: 7,
  revision: 3,
  viewport: { x: 0, y: 0, width: 375, height: 700 },
  pet: { width: 130, height: 130 },
  blockedRects: [{ x: 20, y: 60, width: 300, height: 200 }],
  candidates: [{ x: 12, y: 500 }]
})
```

`renderId` 标识当前卡片面的渲染实例，翻面或换卡都会改变；仅用 card ID 不够，因为正反面可能共用一个 ID。`revision` 标识同一面滚动、字体或图片加载后的几何更新。宿主生成/登记渲染实例，并拒绝旧实例或旧 revision。所有数字使用同一视口内的 CSS 坐标，明确矩形经过裁剪和安全边距处理；捏合缩放时需要记录实际可见视口偏移。

桌宠尺寸由常驻管理器提供给检测脚本，计入实际 CSS 显示和缩放，避免卡片按 `130px` 计算而宿主显示另一种尺寸。更新在每面渲染完成后进行，滚动及布局变化共用一个节流入口；桌宠点击时重新测量或重新请求当前适配器，不使用已经失效的点。

### 需要原生覆盖层时的回传

方案 C 才需要把上述对象序列化为 JSON 并送到 Kotlin。可以复用本地已有的 POST 路由：

```js
fetch('ankidroid/petGeometry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(snapshot)
})
```

当前 [ReviewerViewModel.kt](../../Anki-Android/AnkiDroid/src/main/java/com/ichi2/anki/ui/windows/reviewer/ReviewerViewModel.kt) 已处理 `focusin`、`focusout` 等 `/ankidroid/` 消息；可新增 `petGeometry` 分支，解码到独立 DTO，再发给桌宠状态流/控制器。资源路径是 GET，几何回传是 POST，两者复用不同的现有接入。

这条新增端点当前不存在，需实现后才能调用。应限制消息规模、拒绝非有限数值和过期版本，并在主线程更新视图。跨原生层还要换算 WebView 偏移及缩放；只传一个坐标对不足以支持旋转、滚动与尺寸变化。

也可以增加一个专用 `addJavascriptInterface`，但本地新学习屏的通用 `AnkiDroidJS` 接口只是警告占位，不能假定开启某个通用 API 就已有桌宠回传功能。推荐同页 JS；未来确需原生覆盖层时，再在本地 POST 接口与专用桥接中择一。

## 建议改动清单与实施顺序

**阶段一：模板中的常驻实现。**

- 修改 `src/shared/pet.js`，或新增 `pet-session.js` 并让 `pet.js` 调用它；实现会话单例和卡片适配。
- 提取/增强空位函数、添加可见区域更新与无空位隐藏；可以放在 `pet.js` 内或独立 `pet-geometry.js`。
- 更新 `src/shared/pet.css` 的交互类、隐藏状态及尺寸处理。
- 如果增加共享文件，更新 `scripts/build.mjs` 的拼接步骤；三套 `card.js` 的调用签名可以继续沿用。
- 更新使用说明与已有清理相关断言的预期，并重新生成九份 HTML/CSS 成品。

**阶段二：补齐宿主事件，形成推荐完整方案。**

- 修改 `ReviewerFragment.kt`：加载宿主脚本、转交活动通知、处理暂停/恢复与白板等模式。
- 修改 `CardViewerActivity.kt`：观察用户交互并转交复习 Fragment；其他预览 Fragment 可不接收桌宠通知。
- 新增独立 `scripts/ankidroid-pet-host.js`；需要保持接口独立时，新增活动通知接口。
- 应用开关保存在 `Prefs`，默认媒体列表由应用的宠物 manifest 管理，模板只提交几何信息；纯模板方案继续使用 `pet-config.json`。宿主加载管理标记，即使功能关闭也使模板识别管理模式。
- 增加设置入口和开关联动。首期可直接使用现有七个 GIF 作为 assets；自定义素材导入、子页和参数编辑按需要扩展。

**阶段三：若需要旧学习屏，增加独立覆盖层。**

复用已经拆出的几何适配器和配置，另实现跨页面加载保留的视图/控制器。应用侧只接收可见障碍矩形、候选位置、视口信息和卡片/几何版本，卡片侧负责重新测量。

选择原生图片视图时，本地最低 Android API 为 24，而平台 `ImageDecoder` 的动画解码能力从 API 28 起提供，旧设备需要兼容解码方案；因此 GIF 支持会增加工作量。[Android：ImageDecoder](https://developer.android.com/reference/android/graphics/ImageDecoder)

若使用专用 `addJavascriptInterface`，先注册再加载页面，并把回调中的视图更新切回主线程；接口只处理桌宠数据。[Android：WebView.addJavascriptInterface](https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface(java.lang.Object,%20java.lang.String))

原生坐标转换要结合 WebView 在覆盖层内的偏移、实际可见视口与缩放。不能仅用 CSS 像素乘屏幕密度。覆盖层按桌宠命中范围处理触摸，空白处不拦截卡片手势；几何消息必须丢弃过期卡片版本。支持新旧界面时分别接入对应复习宿主。

## 后续跟随官方 release

方案 A 主要维护模板对宿主 DOM 的适配，通常无需合并 AnkiDroid 功能补丁。方案 B 的应用改动可以独立成提交，新增脚本独立存放，宿主接入保持集中；原有夜间背景变更也应单独保留。

每次升级关注 `stdHtml()` 的 `#qa`、卡片替换边界、渲染完成钩子、手势交互识别、WebView 重建处理和 Activity/Fragment 生命周期。它们保留时，rebase 或 cherry-pick 的人工改动通常有限；官方重构这些位置时仍需要调整，不能保证每个 release 自动合并。

方案 C 的新增组件容易独立保存，但两套复习页接入和坐标/触摸行为有更多升级检查点。普通翻页流程继续使用官方实现，有利于控制补丁范围。

## 实施后的验收范围

| 场景 | 应达到的结果 |
| --- | --- |
| 三套模板连续翻面、换卡、切换笔记类型 | 单只驻留桌宠保留素材和会话状态，适配更新，无重复监听器或动画样式累积 |
| 背面包含 FrontSide、脚本重复执行 | 一个卡片面只注册一次，路过概率只抽取一次 |
| 点击桌宠 | 换到当前有效安全位置，卡片不跟着翻面 |
| 页面和内部容器滚动 | 桌宠屏幕位置安全时保留；内容进入其范围时隐藏/换位；无空位持续隐藏 |
| 图片/字体加载、MathJax、捏合缩放、软键盘、旋转 | 使用新几何信息，坐标一致，可见范围及尺寸正确 |
| 原生菜单、按钮、键盘操作与连续滚动 | 重置空闲计时；停止操作约 15 秒后才触发驻留 |
| 前后台切换、退出复习、WebView 重建 | 后台不继续计时出现，恢复重新检查；退出释放，页面重建按明确规则初始化 |
| 禁用配置、无适配卡片、缺失 GIF、无足够空位 | 暂时隐藏或停止创建，卡片保持可操作，无旧卡片几何残留 |
| 白板、标记图标、全屏视频、明暗主题 | 桌宠行为按排除或隐藏规则执行，相关交互正常 |

首期落点：阶段一验证本地新学习屏的页面常驻能力，阶段二补齐整个复习界面的行为要求；旧学习屏支持单独立项估算。
