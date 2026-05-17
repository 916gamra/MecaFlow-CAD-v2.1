# Zero-Gap Laser CAD Pro ⚡ (MecaFlow-CAD V2)

## 📖 نظرة عامة (Overview)
**Zero-Gap Laser CAD Pro** هو محرك هندسي متقدم يعتمد على الويب، صُمم خصيصاً لقطاع صناعة الأواني المنزلية (Kitchenware Manufacturing) وتطبيقات الليزر ذات الـ Tube Cutting. يوفر النظام حلاً للتشكيل والقطع وتطابق "التطابق الصفري" (Zero-Gap) للأنبوب الساند للمقبض والجدار المنحني للمقلاة، مما يضمن لحاماً ليزرياً دقيقاً.

تم تطوير التطبيق ليسمح بمعاينة الأشكال الهندسية وإجراء عمليات الطرح الهندسي البولياني (CSG Boolean Operations) في المتصفح مباشرة، باستخدام تقنيات `three-csg-ts` و `three-mesh-bvh`.

---

## ✨ الميزات التقنية (Key Features)
1. **الإسقاط الهندسي التام (Zero-Gap Projection)**: محاكاة شكل المقلاة وتوليد قاطع متوافق.
2. **وضع التعشيش المزدوج (Twin Nesting Mode)**: لزيادة الإنتاج بخط قطع مشترك.
3. **تصدير STEP**: توليد سكريبت بايثون متقدم يعمل مع `CadQuery` لإنتاج نماذج CNC دقيقة.
4. **تخزين محلي (Dexie)**: نظام متكامل لحفظ سجلات المشاريع محلياً.

---

## 🛠️ دليل المطورين والتقنيات (Developer Guide & Stack)
أُسس هذا المشروع على بيئة عمل حديثة ومستقرة:
- **الواجهة**: React 19, Vite, TypeScript.
- **التصميم**: Tailwind CSS, Lucide React.
- **محرك 3D**: `three.js` (v0.184+), `@react-three/fiber`, `@react-three/csg`.
- **محرك CSG**: `three-csg-ts` و `three-mesh-bvh`.
- **قاعدة البيانات**: `Dexie.js` (IndexedDB).

### بنية المجلدات (Directory Structure)
- `src/components/ThreeCanvas.tsx`: قلب التطبيق ومنطق الـ WebGL و CSG.
- `src/components/ZeroGapControlPanel.tsx`: لوحة التحكم وإدارة الحالة.
- `src/lib/exportUtils.ts`: أداة توليد كود الـ Python/CadQuery.
- `src/lib/storageBridge.ts`: واجهة الاتصال مع `Dexie` لحفظ المشاريع.

---

## 🚀 دليل الاستخدام السريع
1. **ابدأ مشروعاً جديداً**: من لوحة التحكم (Dashboard).
2. **اضبط المعاملات**: أو قم برفع ملف STL مخصص للأنبوب عبر لوحة التحكم.
3. **تصفح مراحل العمل**: تنقل بين الخطوات واستخدم الأزرار لتوليد النماذج.
4. **التصدير**: استخدم زر "تصدير الملفات" لتوليد ملفات STL أو سكريبتات Python.
