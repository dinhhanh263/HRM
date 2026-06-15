# UI Modern — Xu hướng & Quy tắc xây dựng giao diện 2026

> **Mục đích:** Tài liệu này bổ sung cho mục `🎨 Design System` trong `/CLAUDE.md`. CLAUDE.md định nghĩa *token, màu, spacing, component nền*. File này định nghĩa *cách dùng chúng theo xu hướng UI mới nhất (2026)* để tạo ra giao diện **thông minh, tối giản, mượt mà**.
>
> Khi mâu thuẫn: tuân theo token/màu trong CLAUDE.md, tuân theo *nguyên tắc trải nghiệm* trong file này.
>
> **Lưu ý kỹ thuật quan trọng (bám code thật):** Dự án đang dùng **Tailwind CSS v4 (CSS-first)** — config nằm trong `apps/web/src/index.css` qua `@theme`, token đặt tên `--color-*` (hex), dark mode bật bằng **class `.dark`** trên `<html>` (KHÔNG phải `data-mode`/HSL như đoạn cũ trong CLAUDE.md). Mọi snippet dưới đây bám theo cấu hình thật này.

---

## 0. Triết lý 2026 — "Calm, Confident, Intelligent"

Tổng hợp từ Linear, Vercel, Notion, Stripe và các báo cáo xu hướng 2026. Ba từ khoá chi phối mọi quyết định:

1. **Calm (Tĩnh)** — Hết thời "visual theatrics". Người dùng quá tải thông tin → UI phải *giảm số quyết định*, nhiều khoảng trắng, một điểm nhấn mỗi màn hình. Hiệu ứng phục vụ sự hiểu, không phải trang trí.
2. **Confident (Tự tin)** — Thiết kế quanh *sự tự tin của người dùng*, không phải số lượng tính năng. Mỗi màn hình trả lời rõ: *Chuyện gì vừa xảy ra? Đang xảy ra gì? Tiếp theo làm gì?*
3. **Intelligent (Thông minh)** — AI/affordance thông minh là kỳ vọng mặc định: smart search, insight nổi lên đúng lúc, gợi ý có *bằng chứng*. Nhưng minh bạch > ma thuật.

> **Quy tắc vàng:** Mỗi pixel phải *đưa người dùng tới gần mục tiêu hơn*. Nếu không, xoá nó.

---

## 1. Strategic Minimalism & Progressive Disclosure

**Trend:** Tối giản 2026 = giảm *tải nhận thức*, không phải giảm tính năng. Giải pháp không phải bỏ tính năng mà là *sắp xếp đúng thời điểm người dùng gặp chúng*.

### Quy tắc
- **1 hành động chính / màn hình.** Một primary button (`bg-primary`). Mọi thứ khác là `secondary`/`outline`/`ghost`.
- **Ẩn độ phức tạp sau lớp thứ hai:** filter nâng cao, field tuỳ chọn, bulk action → đưa vào `Sheet`/`DropdownMenu`/`Popover`, không phơi hết ra ngay.
- **Default thông minh:** form điền sẵn giá trị hợp lý (joinDate = hôm nay, contractType = FULL_TIME, status = ACTIVE). Người dùng *xác nhận*, không phải *điền từ đầu*.
- **Tiết lộ dần trong form dài:** chia EmployeeForm thành section có thể thu gọn (Thông tin cá nhân → Công việc → Hợp đồng), không dồn 15 field một lúc.

```tsx
// ✅ Progressive disclosure: field nâng cao ẩn sau toggle
const [showAdvanced, setShowAdvanced] = useState(false);

<button
  type="button"
  onClick={() => setShowAdvanced((v) => !v)}
  className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
>
  <ChevronRight size={14} className={cn('transition-transform', showAdvanced && 'rotate-90')} />
  Tuỳ chọn nâng cao
</button>
{showAdvanced && (
  <div className="mt-3 space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-150">
    {/* idNumber, address, avatar... */}
  </div>
)}
```

---

## 2. Role-Based / Adaptive Experience

**Trend nổi bật nhất cho HRM:** Role-based đã vượt khỏi "phân quyền ẩn/hiện" để trở thành *thiết kế trải nghiệm*. Cùng một sản phẩm nhưng default view khác hẳn theo *việc người dùng thực sự làm*.

Hệ thống có 4 role (`SUPER_ADMIN`, `HR_MANAGER`, `MANAGER`, `EMPLOYEE`) → tận dụng tối đa:

| Role | Dashboard mặc định nên thấy gì |
|------|-------------------------------|
| `SUPER_ADMIN` | Cấu hình tenant, seats, billing, health hệ thống |
| `HR_MANAGER` | Tổng quan nhân sự toàn công ty, đơn chờ duyệt, báo cáo |
| `MANAGER` | **Team của mình trước** — đơn nghỉ chờ duyệt, chấm công team |
| `EMPLOYEE` | **Self-service** — chấm công hôm nay, số phép còn lại, đơn của tôi |

### Quy tắc
- Dashboard render *layout khác nhau* theo role, không chỉ ẩn nút.
- `usePermission().can(...)` để ẩn UI là **UX**, không phải bảo mật — luôn check lại ở server.
- Đừng hiện "40 metric" cho mọi người. Hiện **5 KPI đúng ngữ cảnh role**.

```tsx
const { role } = useAuthStore();

// ✅ Adaptive: chọn widget theo role, không phải 1 dashboard cho tất cả
const widgets = DASHBOARD_BY_ROLE[role] ?? DASHBOARD_BY_ROLE.EMPLOYEE;
return <DashboardGrid widgets={widgets} />;
```

---

## 3. Motion as Structure — Chuyển động có nghĩa

**Trend:** Motion 2026 = *cấu trúc*, không phải gamification. Chuyển động trả lời "cái gì vừa thay đổi, từ đâu tới đâu". Bỏ animation phô trương; giữ micro-interaction *phản hồi tức thì*.

### Token thời lượng (dùng nhất quán)
| Mục đích | Thời lượng | Class |
|----------|-----------|-------|
| Đổi màu/bg (hover, focus) | 100ms | `transition-colors duration-100` |
| Nâng/scale nhẹ (card, elevation) | 150ms | `transition-all duration-150` |
| Panel xuất hiện (dropdown, sheet) | 200ms | `animate-in fade-in-0 slide-in-from-* duration-200` |
| Layout/page transition | 200–250ms | `animate-in fade-in-0 duration-200` |

### Quy tắc
- **Easing:** mặc định `ease-out` cho phần tử *vào*, `ease-in` cho phần tử *ra*. Tránh `linear` (cảm giác máy móc).
- **Phản hồi tức thì:** mọi hành động (lưu, xoá, toggle) phải có phản hồi < 100ms — optimistic UI + toast, không để người dùng "đoán".
- **KHÔNG** animate `width/height/top/left` (gây reflow). Chỉ animate `transform` + `opacity`.
- **KHÔNG** thêm `transform` vào `<button>` (gây layout shift). Card thì được.
- **Framer Motion: dùng tiết kiệm** — chỉ cho list reorder, drag, layout animation phức tạp. Mọi thứ khác dùng `tailwindcss-animate`.
- **Bắt buộc tôn trọng `prefers-reduced-motion`** (xem mục Accessibility).

```tsx
// ✅ Hover lift cho card (elevation tăng) — 150ms, chỉ transform/shadow
<Card className="transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md cursor-pointer">

// ✅ Stagger nhẹ cho list card (KHÔNG dùng cho table row)
{items.map((item, i) => (
  <div key={item.id}
    className="animate-in fade-in-0 slide-in-from-bottom-2"
    style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, animationFillMode: 'both' }}>
    <Card>{/* ... */}</Card>
  </div>
))}
```

---

## 4. Spatial Depth — Độ sâu là thông tin

**Trend:** Depth không để đẹp, mà để *truyền đạt trạng thái*: "phần tử này nổi lên = tương tác được / tạm thời / đang focus". Một hệ elevation nhất quán.

### Thang elevation
| Cấp | Khi nào | Light | Dark |
|-----|---------|-------|------|
| 0 — base | nền trang | `bg-background` | `bg-background` |
| 1 — surface | card, panel | `bg-surface shadow-xs` | `bg-surface` (dựa contrast, ít/không shadow) |
| 2 — raised | card hover, popover | `shadow-md` | `shadow-md` (glow tối) |
| 3 — overlay | dropdown, sheet, dialog | `shadow-lg` | `shadow-lg` |

### Quy tắc
- **Light mode:** dùng shadow để tạo độ sâu.
- **Dark mode:** dùng *contrast nền* (`surface` sáng hơn `background`) thay vì border đậm — "borderless-first". Shadow tối ≈ glow nhẹ.
- Phần tử *nổi lên khi hover* phải kèm tín hiệu: `hover:-translate-y-0.5 hover:shadow-md`.
- Đừng chồng > 1 lớp overlay (modal trên modal). Dùng `Sheet` thay cho dialog lồng nhau.

---

## 5. Subtle Glassmorphism (chỉ ở chỗ đúng)

**Trend:** Glass 2026 đã bỏ blur dày. Giữ lớp translucent *tinh tế*, hiệu quả nhất ở **dark mode** và **lớp dính (sticky/overlay)** để tách lớp mà không thêm màu.

### Dùng ở đâu (và CHỈ ở đây)
- **Header dính:** `bg-background/80 backdrop-blur-md` (đã có trong CLAUDE.md — giữ nguyên).
- **Command palette ⌘K**, **bulk action bar nổi**, **toast**.
- ❌ KHÔNG glass cho card nội dung, table, form — gây giảm contrast chữ, hại a11y.

```tsx
// ✅ Bulk action bar nổi — glass tinh tế
<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
  bg-text-primary/95 backdrop-blur-md text-background
  rounded-xl shadow-lg border border-white/10
  animate-in slide-in-from-bottom-4 duration-200">
```

---

## 6. Design Token Discipline — Không hardcode, không tuỳ tiện

**Trend:** Token-based scalability (color, spacing, type, **motion timing**, radius) là nền cho hệ thống ổn định, dễ đổi theme, đồng bộ light/dark.

### Quy tắc tuyệt đối
- **Màu:** chỉ dùng class map tới token (`bg-primary`, `text-text-secondary`, `border-border`, `bg-surface`). **Cấm hex** (`bg-[#4A9EBF]`).
- **Spacing:** dùng thang 4px của Tailwind (`p-4`, `gap-3`, `space-y-6`). Cấm `p-[18px]` trừ khi có comment lý do.
- **Radius:** dùng `rounded-md` (8px) cho button/input, `rounded-lg` (12px) cho card, `rounded-xl` cho dialog/sheet.
- **Motion:** dùng đúng token thời lượng ở Mục 3.
- Thêm token mới → khai báo trong `@theme` của `apps/web/src/index.css`, không chế biến tại chỗ.

```css
/* apps/web/src/index.css — token sống ở đây (Tailwind v4 CSS-first) */
@theme {
  --color-primary: #4A9EBF;
  --radius-lg: 12px;
  /* thêm token motion nếu cần dùng lại nhiều nơi */
}
```

---

## 7. Typography — Inter + rõ ràng hơn hào nhoáng

**Trend:** Variable font (Inter đã là variable) + type scale chặt chẽ. Kinetic typography chỉ ở hero marketing, **không** trong app admin.

### Quy tắc
- Giữ đúng type scale trong CLAUDE.md (`text-xs` 11px … `text-3xl` 30px), kèm `lineHeight`/`letterSpacing`.
- Heading dùng `tracking-tight` (`-0.02em` trở xuống) cho cảm giác hiện đại, gọn.
- Bật `font-feature-settings: 'cv11','ss01'` (đã có) + `tabular-nums` cho **số liệu trong table/dashboard** để cột số thẳng hàng.
- ❌ Không kinetic/animated text trong admin — phản lại "calm".

```tsx
// ✅ Số liệu dashboard/table căn thẳng
<span className="tabular-nums">{formatCurrency(salary)}</span>
```

---

## 8. Dense Data Tables — Trái tim của HRM

**Trend:** Bảng dày đặc giúp parse nhiều dữ liệu, nhưng phải có *hierarchy + density control + feedback*. Dùng TanStack Table v8.

### Chuẩn row height (cho phép người dùng đổi)
| Density | Height | Khi nào |
|---------|--------|---------|
| Condensed | 40px (`h-10`) | Xem nhiều dòng, ít scroll |
| Regular (default) | 48px (`h-12`) | Mặc định |
| Relaxed | 56px (`h-14`) | Có avatar + 2 dòng phụ |

### Quy tắc bắt buộc
- **Toolbar trên bảng:** search (debounce 300ms), filter, sort, export, density toggle, column visibility.
- **Sticky header** (`sticky top-0 z-10`) khi cuộn dọc; **freeze cột đầu** (tên/avatar) khi nhiều cột.
- **Feedback sort rõ ràng:** header có icon mũi tên + đổi nền khi active. ❌ Cấm sort "im lặng".
- **Row hover** `hover:bg-surface-alt`; **row actions** hiện khi hover (`opacity-0 group-hover:opacity-100`), nhưng luôn truy cập được bằng keyboard (focus-within).
- **Server-side** cho pagination/sort/filter khi > vài trăm dòng; **virtualization** (`@tanstack/react-virtual`) khi render danh sách rất dài.
- **Skeleton** khi load lần đầu, KHÔNG spinner giữa bảng.
- **Empty state** có CTA (xem CLAUDE.md).
- **Numeric columns** căn phải + `tabular-nums`.

```tsx
// ✅ Header có feedback sort + a11y
<TableHead
  role="columnheader"
  aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}
>
  <button
    onClick={toggleSort}
    className="flex items-center gap-1 font-semibold text-text-secondary uppercase tracking-wide
      hover:text-text-primary transition-colors"
  >
    Tên nhân viên
    <ArrowUpDown size={12} className={cn('transition-opacity', isSorted ? 'opacity-100' : 'opacity-40')} />
  </button>
</TableHead>
```

---

## 9. Smart / AI-Assisted Patterns (Progressive Enhancement)

**Trend:** AI là kỳ vọng mặc định 2026 — nhưng *minh bạch > ma thuật*. Triển khai dần, đừng block nếu chưa có backend AI.

### Bắt buộc có ngay (không cần AI)
- **Command Palette ⌘K** (đã yêu cầu trong CLAUDE.md): điều hướng nhanh + hành động ("Thêm nhân viên", "Tạo đơn nghỉ"). Keyboard-first.
- **Smart search:** một ô search hiểu nhiều thực thể (nhân viên, phòng ban, đơn). Có gợi ý gần đây, không phân biệt hoa/thường/dấu.
- **Insight đúng lúc:** số liệu so sánh kỳ trước ("+3 so với tháng trước") đặt cạnh metric, không bắt người dùng đào.

### Khi có AI (làm sau, theo các pattern enterprise 2026)
Năm pattern minh bạch cho mọi tính năng AI — **luôn áp dụng**:
1. **Planning visibility** — hiện AI định làm gì *trước khi* làm.
2. **Tool-use disclosure** — nói rõ AI đang gọi dữ liệu/hành động nào.
3. **Evidence over simplicity** — mỗi gợi ý kèm *nguồn / lý do / độ tin cậy*, không phán "hộp đen".
4. **Override controls** — người dùng luôn sửa/từ chối được gợi ý.
5. **Recovery routing** — khi AI sai/timeout, có đường lui rõ ràng (làm thủ công).

> ⚠️ Đừng phơi nút "AI" nếu chưa có backend. Ưu tiên 3 mục đầu (palette, smart search, insight) — chúng đã tạo cảm giác "thông minh" mà không cần model.

---

## 10. Performance as UX — Tốc độ là trải nghiệm

**Trend:** Hiệu năng là chiến lược UX, không chỉ kỹ thuật. Giao diện nhẹ, adaptive.

### Quy tắc
- **Optimistic updates** cho mutation (TanStack Query): UI đổi ngay, rollback nếu lỗi + toast.
- **Skeleton** mọi initial load; spinner *chỉ* trong button.
- **Code-split theo route** (`React.lazy` + `Suspense`) — mỗi feature (employees, timesheet…) là chunk riêng.
- **Debounce** search 300ms; **prefetch** trang kế của table khi hover pagination.
- **Virtualize** list/table rất dài.
- **`staleTime`** hợp lý (CLAUDE.md gợi 30s) để tránh refetch thừa.
- Ngân sách: tương tác phản hồi < 100ms; chuyển trang cảm giác tức thì nhờ skeleton.

```tsx
// ✅ Optimistic update
useMutation({
  mutationFn: employeeApi.update,
  onMutate: async (next) => {
    await qc.cancelQueries({ queryKey: ['employees'] });
    const prev = qc.getQueryData(['employees']);
    qc.setQueryData(['employees'], (old) => patch(old, next));
    return { prev };
  },
  onError: (_e, _v, ctx) => {
    qc.setQueryData(['employees'], ctx?.prev);
    toast.error('Có lỗi xảy ra, đã hoàn tác.');
  },
  onSettled: () => qc.invalidateQueries({ queryKey: ['employees'] }),
});
```

---

## 11. Accessibility — WCAG 2.2 AA (không thương lượng)

**Trend:** A11y 2026 ảnh hưởng *trực tiếp* tới điều kiện mua hàng enterprise (procurement) — không còn là tuỳ chọn.

### Checklist bắt buộc
- **Contrast:** chữ thường ≥ **4.5:1**, chữ lớn (≥18pt hoặc 14pt bold) ≥ **3:1**, UI elements/icon ≥ 3:1. Test cả light & dark.
- **Keyboard:** mọi hành động làm được bằng Tab/Enter/Esc/Arrow. Modal/sheet **trap focus** và trả focus về trigger khi đóng (Radix lo phần lớn — đừng phá).
- **Focus visible:** giữ ring rõ (`focus-visible:ring-2 focus-visible:ring-primary/40`). ❌ Cấm `outline-none` mà không thay ring.
- **ARIA:** icon-only button có `aria-label`; input có `<Label htmlFor>`; table dùng `aria-sort`; trạng thái loading có `aria-busy`/`aria-live` cho thông báo.
- **Reduced motion:** tôn trọng `prefers-reduced-motion` — tắt animation phi-thiết-yếu.
- **Không dựa vào màu đơn lẻ** để truyền trạng thái: badge trạng thái có *cả màu + chữ* (đã đúng trong CLAUDE.md).
- **Touch target** ≥ 44×44px trên mobile.

```css
/* apps/web/src/index.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 12. Mobile-first & Self-Service

**Trend:** HRIS 2026 thiên về self-service mobile-first, "trực giác như mạng xã hội". Tỷ lệ adoption HRIS trung bình chỉ ~32% → thua ở *điều kiện dùng hàng ngày*, không phải lúc demo.

### Quy tắc
- Responsive thật ở **768px–1440px** (yêu cầu hiện tại) + tối ưu thao tác EMPLOYEE trên mobile (chấm công, xem phép, gửi đơn).
- Sidebar **collapse về icon-only** (56px) ở mobile; main area `overflow-hidden`, content tự cuộn.
- Hành động self-service quan trọng nhất phải đạt được **trong ≤ 2 chạm** từ dashboard.
- Thiết kế cho *workflow dưới áp lực thực tế*, không phải màn demo đẹp: trạng thái loading/empty/error đầy đủ, không dead-end.

---

## ✅ Modern UI Checklist (thêm vào checklist trước commit của CLAUDE.md)

- [ ] **Calm:** đúng 1 primary action / màn hình; không hiệu ứng trang trí thừa
- [ ] **Role-based:** view/widget khác nhau theo role, không chỉ ẩn nút
- [ ] **Motion:** dùng token thời lượng chuẩn; chỉ animate `transform`/`opacity`; tôn trọng `prefers-reduced-motion`
- [ ] **Depth:** elevation nhất quán; dark mode dựa contrast, không border đậm
- [ ] **Glass:** chỉ ở header/overlay/palette, không ở card nội dung
- [ ] **Token:** 0 hex hardcode, 0 spacing tuỳ tiện, radius đúng cấp
- [ ] **Typography:** `tabular-nums` cho số; heading `tracking-tight`
- [ ] **Table:** toolbar đủ (search/filter/sort/density/export); sticky header; feedback sort; skeleton; empty state
- [ ] **Smart:** ⌘K palette hoạt động; smart search bỏ dấu/hoa-thường; insight đặt cạnh metric
- [ ] **AI (nếu có):** planning visibility + evidence + override + recovery
- [ ] **Performance:** optimistic update; code-split route; debounce search; virtualize list dài
- [ ] **A11y:** contrast 4.5:1; keyboard đầy đủ; focus-visible; aria-label/aria-sort; reduced-motion
- [ ] **Mobile:** self-service ≤ 2 chạm; responsive 768–1440; touch target ≥ 44px

---

## Nguồn tham khảo (UI/UX trends 2026)

- [7 SaaS UI Design Trends in 2026 — SaaSUI](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [Smart SaaS Dashboard Design Guide (2026) — F1Studioz](https://f1studioz.com/blog/smart-saas-dashboard-design/)
- [SaaS Dashboard UX Patterns: Complete 2026 Guide — GitNexa](https://www.gitnexa.com/blogs/saas-dashboard-ux-patterns)
- [UX/UI trends for 2026: calm interfaces, transparent AI — Envato](https://elements.envato.com/learn/ux-ui-design-trends)
- [What's Next: 7 UI Design Trends of 2026 — Tubik](https://blog.tubikstudio.com/ui-design-trends-2026/)
- [UI Design Trends 2026 — MockFlow](https://mockflow.com/blog/ui-design-trends)
- [The Developer's Guide to Generative UI in 2026 — CopilotKit](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026)
- [Agent UX: designing UI for AI agents in 2026 — FuseLab](https://fuselabcreative.com/ui-design-for-ai-agents/)
- [Enterprise UI Design in 2026 — Hashbyt](https://hashbyt.com/blog/enterprise-ui-design)
- [Data Table Design UX Patterns — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [The Ultimate Guide to Designing User-Friendly Data Tables — Lollypop](https://lollypop.design/blog/2026/march/the-ultimate-guide-to-designing-user-friendly-data-tables/)
- [WCAG AA Accessibility in Design Systems — Medium (D. Chandradas)](https://medium.com/@darshii.chandradas/wcag-aa-accessibility-in-design-systems-a-ux-first-perspective-with-real-examples-008d0a633c38)
- [HR Software UX Benchmarking 2026 — Interface Design](https://interface-design.co.uk/blog/hr-software-ux-benchmarking-2026/)
- [Top HRIS Trends to Watch in 2026 — HRLaunch](https://hrlaunchtechnology.com/blog/top-hris-trends-to-watch-in-2026)

*Created: 2026-05-30 | Bổ sung cho /CLAUDE.md Design System | Maintained by: Đinh Văn Hạnh*
