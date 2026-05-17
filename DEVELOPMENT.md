# Development Guide 🛠️ (دليل المطورين)

هذا الدليل مخصص للمبرمجين الذين سيعملون على صيانة أو تطوير MecaFlow-CAD V2.

## 📁 هيكلة المشروع (Project Structure)
- `src/components/ThreeCanvas.tsx`: قلب النظام (محرك CSG و 3D).
- `src/components/ZeroGapControlPanel.tsx`: واجهة التحكم الديناميكية.
- `src/lib/storageBridge.ts`: إدارة البيانات المحلية باستخدام `Dexie.js`.
- `src/lib/exportUtils.ts`: توليد كود `CadQuery/Python`.
- `src/App.tsx`: نقطة الدخول (Entry Point).

## ➕ إضافة ميزة جديدة
1. حدد النوع في `src/types.ts`.
2. أضف البيانات في حالة `defaultZeroGap` داخل `src/App.tsx`.
3. اضبط واجهة المستخدم في `src/components/ZeroGapControlPanel.tsx`.
4. حدّث المنطق الرياضي في `src/components/ThreeCanvas.tsx`.

## 📦 أوامر التطوير
```bash
npm run dev      # بدء خادم التطوير (Hot Reload)
npm run build    # تجهيز الملفات النهائية
npm run lint     # فحص توافقية TypeScript
```
