# توثيق API - MecaFlow-CAD V2

هذا المستند يوضح أبرز المكتبات والإعدادات التي تمت إضافتها.

## 1. Error Systems
- **ErrorLogger**: يتتبع أخطاء المتصفح ويسجلها داخلياً.
- **ErrorBoundary**: يظهر واجهة بديلة عند حدوث خطأ في التصيير ثلاثي الأبعاد.

## 2. WebGL & Geometry Tools
- **Validators (`validators.ts`)**: للتحقق من معاملات الأنبوب والمقلاة.
- **Performance Optimizer**: يستخدم `Debounce` لمنع تجميد المتصفح أثناء إعادة الحساب.
- **Export Utilities (`exportUtils.ts`)**: توليد سكريبتات Python لـ `CadQuery`.
