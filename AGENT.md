# 📘 مستند جامع معماری و منطق فنی پروژه DeepFocus (AI Context Handoff)

این سند به عنوان مرجع فنی (Single Source of Truth) برای درک کامل معماری، ساختار فایل‌ها، مدل داده‌ها (State Schema) و منطق عملکردی پروژه **DeepFocus Dashboard** طراحی شده است تا در جلسات بعدی توسعه، دستیار هوش مصنوعی دیدی ۱۰۰٪ دقیق نسبت به کدبیس داشته باشد.

---

## ۱. معرفی کلی و فلسفه طراحی (Project Overview)
* **هدف پروژه:** یک وب‌اپلیکیشن مینیمال و مدرن برای مدیریت جلسات تمرکز عمیق (Pomodoro)، مدیریت تسک‌ها (`Works`) و تخلیه ذهنی (`Thoughts / Brain Dump`).
* **تکنولوژی‌ها (Zero-Dependency):** HTML5، CSS3 خام (Flexbox, CSS Variables, Conic Gradients, Backdrop Filter) و Vanilla JavaScript (ES6+). بدون استفاده از هیچ فریم‌ورک یا کتابخانه خارجی.
* **پشتیبانی از پلتفرم‌ها:** کاملاً واکنش‌گرا (Responsive) برای دسکتاپ، تبلت و موبایل؛ قابل اجرا هم به صورت استاتیک روی GitHub Pages (`[https://behjatifar.github.io/DEEPfoucs/](https://behjatifar.github.io/DEEPfoucs/)`) و هم به صورت محلی (`file://`) بدون خطای CORS.
* **استایل بصری (Gemini-Inspired Dark UI):** پس‌زمینه مشکی مات (`#0a0a0a` / `#121212`) با گرادیانت‌های نوری محیطی به رنگ‌های آبی الکتریک (`#3b82f6`) در بالا-چپ و بنفش عمیق (`#8b5cf6`) در پایین-راست[cite: 1] همراه با کارت‌های شیشه‌ای (Glassmorphism) و آیکون Favicon اختصاصی به شکل حرف **D** سفید روی پس‌زمینه گرادیانت تیره[cite: 1].

---

## ۲. اصول و قوانین کدنویسی (Coding Standards & Rules)
در هرگونه توسعه یا ویرایش بعدی، رعایت این ۴ قانون الزامی است:
1. **برنامه‌نویسی تابعی (Functional Programming):** استفاده از توابع خالص (Pure Functions) برای تغییر وضعیت (Immutability با استفاده از `map`, `filter`, `sort`, و Spread Operator).
2. **عدم تکرار کد (DRY Principle):** منطق رندر و مدیریت لیست‌های `works` و `thoughts` نباید کپی شود؛ هر دو از یک موتور رندرینگ و توزیع‌کننده اکشن (Dispatcher) واحد که بر پایه قوانین کانفیگ (`DOM.collections`) کار می‌کند، تغذیه می‌شوند.
3. **جداسازی قوانین و پیکربندی‌ها (Modular Configuration):** تمامی تنظیمات پیش‌فرض، قوانین مرتب‌سازی، پیام‌های آماده‌سازی سشن و ابعاد خروجی تصویر در ابتدای فایل‌ها در قالب ثابت‌های پیکربندی (`DEFAULT_STATE`, `SESSION_PREP_RULES`, `CONFIG`) تعریف شده‌اند تا به سادگی قابل تغییر باشند.
4. **کامنت‌گذاری انگلیسی:** تمامی کامنت‌های داخل کدها باید به زبان انگلیسی، دقیق و توضیح‌دهنده منطق ماژولار باشند.

---

## ۳. ساختار فایل‌ها و ماژول‌ها (File Structure)

تگ‌های `<script>` در انتهای `index.html` به ترتیب زیر و بدون `type="module"` بارگذاری می‌شوند تا از خطای CORS در پروتکل `file://` جلوگیری شود:

```text
├── index.html          # ساختار اصلی DOM، تایمر، لیست‌ها، مودال سطل زباله، اورلی ۱۰ ثانیه‌ای و SVG Favicon
├── style.css           # متغیرهای CSS، تم دارک، استایل کامپوننت‌ها، مودال‌ها و Media Queries ریسپانسیو موبایل
├── storage.js          # ماژول StorageHandler (ذخیره و بازیابی ایمن JSON در LocalStorage)
├── timer.js            # ماژول TimerEngine (موتور تایمر مبتنی بر Delta-Time ساعت سیستم و Web Audio API)
├── exporter.js         # ماژول ReportExporter (تولید کارت گرافیکی گزارش روزانه PNG با HTML5 Canvas API)
└── app.js              # کنترلر اصلی، مدیریت State، منطق Drag & Drop، رندرینگ DOM و Event Listeners
```

---

## ۴. ساختار وضعیت و داده‌ها در `LocalStorage` (State Schema)

کل وضعیت برنامه تحت کلید `'deepFocusState'` در `localStorage` ذخیره می‌شود. ساختار دقیق آبجکت `appState` به شرح زیر است:

```javascript
const DEFAULT_STATE = {
    // لیست تسک‌های اصلی (دارای چک‌باکس و مرتب‌سازی خودکار)
    works: [
        // { id: string, text: string, completed: boolean, completedAt: number|null, isSpoiler: boolean }
    ],
    // لیست افکار و تخلیه ذهنی (بدون چک‌باکس، دارای دکمه تبدیل به Work)
    thoughts: [
        // { id: string, text: string, isSpoiler: boolean }
    ],
    // لیست سطل زباله / آرشیو (نگهداری آیتم‌های حذف‌شده از هر دو لیست)
    trash: [
        // { id: string, text: string, origin: 'works'|'thoughts', deletedAt: number, completed?: boolean, completedAt?: number|null, isSpoiler: boolean }
    ],
    // آمار پومودوروهای روزانه (ریست خودکار در صورت تغییر تاریخ روز)
    stats: {
        pomodorosCompleted: 0,
        lastDate: "Tue Oct 06 2026" // new Date().toDateString()
    },
    // تنظیمات زمان تایمر بر حسب دقیقه
    timerSettings: {
        workTime: 25,
        restTime: 5
    },
    // وضعیت فعال/غیرفعال بودن سانسور کلی برای هر لیست
    spoilerAll: {
        works: false,
        thoughts: false
    }
};
```

> **نکته پایداری (Backward Compatibility):** در ابتدای `app.js`، پس از لود شدن `appState` از `LocalStorage`، بررسی‌های ایمن (`Array.isArray` و Fallback) انجام می‌شود تا اگر ساختار ذخیره شده از نسخه‌های قبلی ناقص بود، برنامه کرش نکند.

---

## ۵. شرح دقیق منطق ماژول‌ها و قابلیت‌ها (Feature Logic Breakdown)

### ۵.۱. موتور تایمر بدون خطا در پس‌زمینه (`timer.js`)
* **رفع باگ Background Tab Throttling:** مرورگرها هنگام Minimize شدن یا رفتن به تب دیگر، اجرای `setInterval` را کند یا متوقف می‌کنند. برای حل این مشکل، به جای کم کردن ساده `timeLeft -= 1`، در لحظه استارت تایمر، زمان دقیق پایان محاسبه می‌شود:
  `targetEndTime = Date.now() + (initialTimeLeftSeconds * 1000)`
* **همگام‌سازی (`syncWithSystemClock`):** در هر تیک (هر ۵۰۰ میلی‌ثانیه) و همچنین به محض برگشتن کاربر به تب (`visibilitychange` event)، زمان باقی‌مانده از اختلاف `targetEndTime - Date.now()` محاسبه می‌شود.
* **نمایش در عنوان تب (`document.title`):** هنگام روشن بودن تایمر، زمان باقی‌مانده و مود فعلی در تایتل تب مرورگر نمایش داده می‌شود: `(24:12) Work - Deep Focus`.
* **هشدار صوتی (`playBeep`):** در پایان هر سشن، با استفاده از `Web Audio API` (نوسان‌ساز سینوسی روی نت C5 با فرکانس `523.25Hz`) یک صدای ملایم بدون نیاز به فایل صوتی خارجی پخش می‌شود.

### ۵.۲. پیام ۱۰ ثانیه‌ای آماده‌سازی شروع سشن (`Session Preparation Overlay`)
* **منطق اجرا:** تنها زمانی که تایمر در حالت `work` است و از ابتدا شروع می‌شود (`timeLeft === totalTime`)، با زدن دکمه `Start`، پنجره مودال `#prep-overlay` به مدت ۱۰ ثانیه باز می‌شود.
* **محتوا (پیکربندی در `SESSION_PREP_RULES`):**
  1. بستن شبکه‌های اجتماعی (`Close Social Media Apps`) و تب‌های اضافی.
  2. کشیدن چند نفس عمیق با بینی.
  3. همراه داشتن و نوشیدن آب در طول سشن.
  4. آرزوی تجربه یک سشن تمرکز عمیق همراه با نوار پیشرفت (Progress Bar) معکوس ۱۰ ثانیه‌ای و دکمه «رد کردن ⏭️» (`#btn-skip-prep`).

### ۵.۳. تقویم دوزبانه و آمار روزانه (`Dates & Daily Stats`)
* تابع خالص `getFormattedDates` با استفاده از `Intl.DateTimeFormat` استاندارد مرورگر، تاریخ روز را به دو فرمت **شمسی (`fa-IR-u-ca-persian`)** و **میلادی (`en-US`)** تولید کرده و زیر عنوان `Work Mode` نمایش می‌دهد.
* تابع `checkDailyStats` در زمان بارگذاری و پایان هر پومودورو چک می‌کند که آیا `stats.lastDate` با تاریخ امروز یکی است یا خیر؛ در صورت تغییر روز، شمارنده پومودورو را صفر می‌کند.

### ۵.۴. معماری یکپارچه لیست‌ها، مرتب‌سازی خودکار و Drag & Drop (`app.js`)
* **پیکربندی `DOM.collections`:** ویژگی‌های هر لیست در یک آبجکت قوانین تعریف شده است:
  * `works`: دارای چک‌باکس (`hasCheckbox: true`)، غیرقابل تبدیل (`canConvert: false`)، قابل مرتب‌سازی دستی (`isSortable: true`) و دارای قانون مرتب‌سازی خودکار انجام‌شده‌ها (`autoSortCompleted: true`).
  * `thoughts`: بدون چک‌باکس، دارای دکمه تبدیل `↗` به تسک کاری (`canConvert: true`)، قابل مرتب‌سازی دستی (`isSortable: true`) و بدون مرتب‌سازی خودکار (`autoSortCompleted: false`).
* **قانون مرتب‌سازی خودکار (`sortByCompletionRule`):**
  1. تسک‌های انجام‌نشده (`completed: false`) همیشه در بالای لیست قرار می‌گیرند و ترتیب Drag & Drop بین خودشان حفظ می‌شود.
  2. به محض تیک خوردن یک تسک، زمان دقیق انجام در `completedAt: Date.now()` ثبت می‌شود.
  3. تسک‌های انجام‌شده به پایین لیست منتقل می‌شوند؛ به طوری که **اولین تسک انجام‌شده در پایین‌ترین نقطه لیست** و جدیدترین تسک انجام‌شده بالاتر از سایر تسک‌های تیک‌خورده قرار می‌گیرد.
* **سیستم Drag & Drop:** با استفاده از HTML5 Drag & Drop API و تابع خالص `reorderListById`، کاربر می‌تواند با گرفتن دستگیره `⠿` اولویت آیتم‌ها را جابه‌جا کند.

### ۵.۵. سیستم محرمانگی و سانسور (`Spoiler Mode`)
* **تکی و گروهی:** هر آیتم دارای دکمه چشم (`👁️` / `🙈`) است که ویژگی `isSpoiler` همان آیتم را تغییر می‌دهد. همچنین در هدر هر بخش دکمه `Spoiler All` (`data-spoiler-group`) وجود دارد که تمام آیتم‌های آن بخش را یکجا تار (`filter: blur(6px)`) یا شفاف می‌کند.
* اگر کاربر با موس روی متن تارشده برود (`:hover`)، متن به صورت موقت خوانا می‌شود.

### ۵.۶. سطل زباله و آرشیو (`Recycle Bin / Soft Delete`)
* **حذف نرم (Soft Delete):** زدن دکمه ضربدر (`×`) روی هر تسک در `Works` یا هر فکر در `Thoughts`، آن را به طور کامل پاک نمی‌کند؛ بلکه تابع خالص `archiveItemToTrash` آیتم را به همراه برچسب مبدا (`origin: 'works' | 'thoughts'`) و زمان حذف (`deletedAt`) به آرایه `appState.trash` منتقل می‌کند.
* **مدیریت سطل زباله (`dispatchTrashAction`):** با کلیک روی دکمه `🗑️` در هدر `Works`، مودال `#trash-modal` باز می‌شود که در آن هر آیتم دارای تگ رنگی مبدا (`WORK` آبی / `THOUGHT` بنفش)، دکمه **بازیابی (`↩` Restore)** به لیست اولیه خود و دکمه **حذف دائمی (`×` Permanent Delete)** است. همچنین دکمه `Empty All` کل سطل زباله را خالی می‌کند.

### ۵.۷. خروجی تصویر گزارش کار روزانه (`exporter.js`)
* ماژول مستقل `ReportExporter` با استفاده از `HTML5 Canvas API` (با مقیاس `2x` برای کیفیت Retina) یک کارت گرافیکی PNG تولید و دانلود می‌کند.
* **محتوای کارت گزارش:** پس‌زمینه دارک با گرادیانت‌های آبی و بنفش، عنوان برنامه، تاریخ شمسی و میلادی، دو باکس آماری بزرگ (تعداد پومودوروهای امروز و تعداد تسک‌های تکمیل‌شده) و لیست تمام تسک‌های تیک‌خورده (`completed: true`).
* **رعایت حریم خصوصی در خروجی عکس:** اگر تسکی در حالت `isSpoiler` باشد (یا `Spoiler All` فعال باشد)، متن آن در تصویر خروجی چاپ نمی‌شود و به جای آن عبارت `•••••••••••••••••••••••• (Spoiler)` درج می‌گردد.

### ۵.۸. طراحی ریسپانسیو موبایل (`style.css`)
* در صفحات کوچک‌تر از `992px`، قفل اسکرول (`overflow: hidden`) برداشته شده و گرادیانت‌های پس‌زمینه `position: fixed` می‌شوند.
* با استفاده از `display: contents` روی `.main-content` و خاصیت `order` در Flexbox، چیدمان موبایل به ترتیب اولویت کاربر تنظیم شده است:
  1. **تایمر پومودورو** (`order: 1`)
  2. **لیست کارها - Works** (`order: 2`)
  3. **لیست افکار - Thoughts** (`order: 3`)
* سایز فونت اینپوت‌ها در موبایل روی `16px` قفل شده تا از زوم خودکار مرورگر iOS Safari هنگام تایپ جلوگیری شود.

### ۵.۹. سیستم اختصاص زمان به تسک، ثبت لحظه‌ای و ویرایش درون‌خطی (`Time Assign, Real-Time Sync & Inline Rename`)
* **مدل داده (`works` & `stats`):**
  * هر تسک در `works` دارای فیلدهای `allocatedMinutes: number` (زمان تخمینی به دقیقه) و `spentMinutes: number` (زمان کارشده به دقیقه) است.
  * در `appState`، کلید `activeTaskId` شناسه تسکی که در حال حاضر روی تایمر قفل شده را نگه می‌دارد و `stats.totalFocusedMinutes` مجموع دقایق تمرکز روز را ذخیره می‌کند.
* **ثبت لحظه‌ای دقیقه به دقیقه (`syncRealTimeElapsedMinutes`):**
  * در حالت `work`، متغیر `currentTimer.lastRecordedRemainingSeconds` زمان آخرین ثبت را نگه می‌دارد. به محض اینکه اختلاف آن با زمان باقی‌مانده فعلی به `60` ثانیه برسد، ۱ دقیقه به `spentMinutes` تسک فعال و `stats.totalFocusedMinutes` اضافه می‌شود. به این ترتیب در صورت توقف یا ریست شدن تایمر در میانه کار، زمان کارشده از بین نمی‌رود.
* **ویرایش درون‌خطی (`Inline Rename & Time Edit`):**
  * با کلیک روی دکمه `✎` یا دابل‌کلیک روی متن هر آیتم در `Works` یا `Thoughts`، آیتم وارد حالت ویرایش (`editingState`) شده و با تابع خالص `updateItemDetails` نام و زمان آن بدون تغییر اولویت بروزرسانی می‌شود.

### ۵.۱۰. سیستم ترکیبی فولدربندی، نوار فیلتر و زیرتسک‌ها (`Hybrid Folders, Filter Pills & Sub-tasks`)
* **ساختار داده (`works`):** هر آیتم در `works` می‌تواند یک تسک مستقل یا یک فولدر (`isFolder: true`, `isCollapsed: boolean`, `subtasks: []`) باشد.
* **تبدیل دوطرفه و نوار فیلتر (`#folder-tabs-bar`):**
  1. بالای لیست `Works` نوار فیلتر قرصی `[ All ] [ 📁 ... ] [ + 📁 ]` قرار دارد.
  2. کاربر می‌تواند با زدن دکمه `+ 📁` یک فولدر جدید بسازد یا با زدن دکمه `➕` کنار هر تسک معمولی، به آن زیرتسک (`Sub-task`) اضافه کرده و آن را به یک تایتل فولدر تاشو تبدیل کند.
  3. در حالت `All`، همه تسک‌ها و فولدرها نمایش داده می‌شوند و کلیک روی تایتل هر فولدر (`📁 ▾`) زیرتسک‌های آن را باز یا بسته می‌کند.
  4. با کلیک روی قرص هر فولدر (مثلاً `[ 📁 زبان ]`)، لیست فیلتر شده و فرم اصلی افزودن تسک در بالای سایدبار، تسک‌های جدید را مستقیماً به عنوان زیرتسکِ همان فولدر اضافه می‌کند.
* **محاسبه تجمیعی زمان (`getEffectiveTimeTotals`):** زمان اختصاص‌یافته و زمان صرف‌شده هر فولدر به صورت خودکار از مجموع زمان زیرتسک‌های آن محاسبه و روی نوار پیشرفت فولدر نمایش داده می‌شود.

---

## ۶. رابط‌های ارتباطی بین ماژول‌ها (Global Module APIs)

* **`StorageHandler` (`storage.js`):**
  * `StorageHandler.save(key, data)`
  * `StorageHandler.load(key, defaultData)`
* **`TimerEngine` (`timer.js`):**
  * `TimerEngine.start(initialTimeLeftSeconds, tickCallback, endCallback)`
  * `TimerEngine.stop()`
  * `TimerEngine.formatTime(seconds)` -> `'MM:SS'`
  * `TimerEngine.calculateProgress(timeLeft, totalTime)` -> `0..360`
  * `TimerEngine.playBeep()`
* **`ReportExporter` (`exporter.js`):**
  * `ReportExporter.exportDailyReport({ works, stats, dates, spoilerAllWorks })`
* **توابع سراسری متصل به رویدادهای درون‌خطی HTML (`app.js`):**
  * `window.dispatchItemAction(groupKey, action, id)` -> اکشن‌ها: `'toggleComplete'`, `'toggleSpoiler'`, `'delete'`, `'convert'`
  * `window.dispatchTrashAction(action, id)` -> اکشن‌ها: `'restore'`, `'permanentDelete'`, `'emptyAll'`

  ---

## ۷. پروتکل تعامل و نحوه ارائه کد توسط هوش مصنوعی (AI Collaboration & Diff-Only Rule)

برای صرفه‌جویی در زمان، جلوگیری از شلوغی پاسخ‌ها و کاهش خطای انسانی هنگام کپی کردن کدها، دستیار هوش مصنوعی موظف است در تمامی جلسات توسعه و دیباگ، قوانین زیر را به صورت **صددرصدی** رعایت کند:

1. **ممنوعیت بازنویسی کل فایل‌ها (No Full-File Rewrites):**
   * هرگز کل کدهای فایل‌های پروژه (مانند `app.js`، `style.css`، `exporter.js` یا `index.html`) را از اول تا آخر بازنویسی و ارسال نکن (مگر اینکه کاربر صراحتاً درخواست کد کامل یک فایل را داشته باشد).
2. **ارائه کد به صورت موضعی و تفاضلی (Modular / Diff-Only Updates):**
   * تنها **بخش‌های جدید** یا **توابع و استایل‌های تغییریافته** را کدنویسی کن.
   * قبل از هر قطعه کد، **آدرس دقیق محل درج یا جایگزینی** را با اشاره به شماره بخش یا نام تابع/کلاس قبلی و بعدی مشخص کن (مثلاً: *«در فایل `app.js`، داخل بخش `3. Pure Functional Helpers`، این تابع را بعد از تابع `toggleItemProp` اضافه کن»*).
3. **روال عیب‌یابی و رفع باگ موضعی (Targeted Debugging Workflow):**
   * در صورتی که کاربر هنگام اعمال تغییرات با باگ، تداخل یا سوالی مواجه شد، به جای حدس زدن یا بازنویسی کل فایل، از کاربر بخواه **فقط همان تکه کد یا تابع مرتبط** را ارسال کند تا بررسی و دیباگ به صورت متمرکز و نقطه‌ای روی همان بخش انجام شود.