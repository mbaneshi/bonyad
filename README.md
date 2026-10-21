# Bonyad — بنیاد

**English** · [فارسی](#بنیاد-فارسی)

**An open-source lab for a shared computational foundation under engineering software.**

- 🌐 Website: <https://mbaneshi.github.io/bonyad/>
- 🗺️ Roadmap: [Project 24](https://github.com/users/mbaneshi/projects/24)
- 💬 RFCs and questions: [Discussions](https://github.com/mbaneshi/bonyad/discussions)

## Purpose

Bonyad explores one core in which engineering knowledge is defined, composed,
computed, validated, revised and presented, and on which each discipline is built
without growing a parallel model every time. Surveying comes first, then civil,
architecture, MEP, traffic and urbanism.

## Principles

- **Explicit meaning.** Entities, typed values, relationships, constraints, procedures,
  composition and revisions are defined, not implied.
- **Cumulative knowledge.** A new capability reuses earlier definitions instead of
  duplicating them. Composition is first-class.
- **Separate what differs.** State vs procedure, definition vs instance, computation vs
  persistence, current state vs revision, authoritative data vs derived results.
- **Change is a proposal, then an acceptance** against an expected revision; a
  concurrent edit is a visible conflict, never a silent overwrite.
- **Humans and AI agents are equal actors** on the same operations, permissions and rules.
- **Concrete first.** No generic framework before a working example proves the need.

Full text: [manifesto](https://github.com/mbaneshi/bonyad/blob/dev/docs/manifesto.md).

## Stack

| Layer | Choice |
|---|---|
| Data | PostgreSQL through a full self-hosted Supabase (Auth, Storage, Realtime, Studio, Edge Functions), Dockerized |
| Logic | Rust: API and engineering computation |
| UI | React + TypeScript, Persian/RTL and mobile-first |
| Agent | TypeScript (Bun) service on the Anthropic SDK; its tools call the same API operations as the UI, checked by a contract test |

## Status

**Design stage. Nothing is runnable yet.** The design is written and *proposed*:
the [first-slice design](https://github.com/mbaneshi/bonyad/blob/dev/docs/superpowers/specs/2026-10-21-first-slice-design.md)
is a draft and the [decision records](https://github.com/mbaneshi/bonyad/blob/dev/docs/decisions/0001-first-slice-decisions.md)
are proposed, not accepted. There is deliberately no quick-start; this section changes
when the first slice runs.

The first slice is point, line and surface, end to end (database → Rust → React →
edit → persist → reload), driven both by a person and by an AI agent through the same
operations. Expected: a line from (0, 0) to (4, 0) has length 4 and a surface with
vertices (0, 0), (4, 0), (0, 3) has area 6; moving the vertex (4, 0) to (8, 0) gives
area 12, and the state survives a reload.

## Contributing

`dev` is the default branch; `main` is the released line and moves only by a version
tag. One issue = one short-lived worktree branch = one pull request into `dev`. After
cloning, run `scripts/setup-hooks` once. Details, the RFC process and how to work on
the website: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Not yet decided (Apache-2.0 is recommended). Until a `LICENSE` file lands, no license
is granted.

---

<div dir="rtl">

## بنیاد (فارسی)

[English](#bonyad--بنیاد) · **فارسی**

**یک آزمایشگاه متن‌باز برای ساخت بنیان محاسباتیِ مشترک زیر نرم‌افزارهای مهندسی.**

- 🌐 وب‌سایت: <https://mbaneshi.github.io/bonyad/>
- 🗺️ نقشهٔ راه: [پروژهٔ ۲۴](https://github.com/users/mbaneshi/projects/24)
- 💬 RFC و پرسش‌ها: [Discussions](https://github.com/mbaneshi/bonyad/discussions)

### هدف

بنیاد هسته‌ای را بررسی می‌کند که دانش مهندسی در آن تعریف، ترکیب، محاسبه، اعتبارسنجی،
بازنگری و ارائه می‌شود و هر رشته بدون ساختن مدلی موازی روی آن بنا می‌شود. نقشه‌برداری
اول است؛ سپس عمران، معماری، تأسیسات، ترافیک و شهرسازی.

### اصول

- **معنای صریح.** موجودیت، مقدار تایپ‌دار، رابطه، قید، رویه، ترکیب و بازنگری تعریف
  می‌شوند، نه اینکه ضمنی بمانند.
- **انباشت دانش.** هر قابلیت تازه از تعریف‌های پیشین استفاده می‌کند و آن‌ها را تکرار
  نمی‌کند. ترکیب مفهومی درجه‌اول است.
- **جدا کردن آنچه متفاوت است.** حالت از رویه، تعریف از نمونه، محاسبه از ذخیره‌سازی،
  وضعیت کنونی از بازنگری، و داده معتبر از نتیجهٔ مشتق‌شده.
- **تغییر ابتدا پیشنهاد است، سپس پذیرش** بر پایهٔ بازنگری مورد انتظار؛ تغییر هم‌زمان
  تعارضی آشکار است، نه بازنویسی بی‌صدا.
- **انسان و عامل هوش مصنوعی بازیگرانی برابرند** با همان عملیات، مجوزها و قواعد.
- **ابتدا مشخص، بعد کلی.** پیش از اثبات نیاز با یک مثال کارا، چارچوب کلی نمی‌سازیم.

متن کامل: [منشور](https://github.com/mbaneshi/bonyad/blob/dev/docs/manifesto.md) (به انگلیسی).

### فناوری‌ها

| لایه | انتخاب |
|---|---|
| داده | PostgreSQL از طریق Supabase کامل و خودمیزبان (Auth، Storage، Realtime، Studio، Edge Functions) در Docker |
| منطق | Rust: API و هستهٔ محاسبات مهندسی |
| رابط | React و TypeScript، فارسی، راست‌به‌چپ و موبایل‌محور |
| عامل | سرویس TypeScript (با Bun) روی SDK رسمی Anthropic؛ ابزارهایش همان عملیات API رابط کاربری را فرا می‌خوانند و با یک آزمون قرارداد بررسی می‌شوند |

### وضعیت

**مرحلهٔ طراحی؛ هنوز چیزی قابل اجرا نیست.** طراحی نوشته و *پیشنهاد* شده است:
[طراحی برش اول](https://github.com/mbaneshi/bonyad/blob/dev/docs/superpowers/specs/2026-10-21-first-slice-design.md)
پیش‌نویس است و [سوابق تصمیم](https://github.com/mbaneshi/bonyad/blob/dev/docs/decisions/0001-first-slice-decisions.md)
پیشنهادی‌اند، نه پذیرفته‌شده. عمداً راهنمای شروع سریع نداریم؛ این بخش وقتی عوض می‌شود
که برش اول اجرا شود.

برش اول نقطه، خط و سطح است، از ابتدا تا انتها (پایگاه‌داده ← Rust ← React ← ویرایش ←
ذخیره ← بارگذاری دوباره)، که هم انسان و هم عامل هوش مصنوعی با همان عملیات آن را
می‌رانند. نتیجهٔ مورد انتظار: خطی از <bdi>(0, 0)</bdi> تا <bdi>(4, 0)</bdi> طول <bdi>4</bdi> دارد و
سطحی با رأس‌های <bdi>(0, 0)</bdi>، <bdi>(4, 0)</bdi>، <bdi>(0, 3)</bdi> مساحت <bdi>6</bdi>؛ با جابه‌جایی
رأس <bdi>(4, 0)</bdi> به <bdi>(8, 0)</bdi> مساحت <bdi>12</bdi> می‌شود و وضعیت پس از بارگذاری دوباره حفظ می‌شود.

### مشارکت

`dev` شاخهٔ پیش‌فرض است؛ `main` خط انتشار است و فقط با برچسب نسخه جلو می‌رود. هر issue
یک شاخهٔ کوتاه‌عمر در worktree و یک pull request به `dev` است. پس از clone یک بار
`scripts/setup-hooks` را اجرا کنید. جزئیات، فرایند RFC و کار روی وب‌سایت:
[CONTRIBUTING.md](CONTRIBUTING.md).

### پروانه

هنوز تصمیم‌گیری نشده است (Apache-2.0 پیشنهاد می‌شود). تا زمانی که فایل `LICENSE` اضافه
نشده، هیچ پروانه‌ای اعطا نمی‌شود.

</div>
