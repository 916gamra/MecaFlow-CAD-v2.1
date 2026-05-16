import { useState, useEffect } from 'react';
import { StorageBridge, localDB, ProjectRecord } from '../lib/storageBridge';

export function useProjectHistory(projectId?: string) {
  // حالات إدارة التراجع والإعادة (Undo/Redo) محلياً في الذاكرة لتسريع الأداء
  const [history, setHistory] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [currentProject, setCurrentProject] = useState<ProjectRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!projectId);

  // 1. تحميل المشروع من قاعدة البيانات المحلية عند فتح التطبيق أو تغيير المشروع
  useEffect(() => {
    async function loadProject() {
      if (!projectId) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const project = await localDB.projects.get(projectId);
        if (project) {
          setCurrentProject(project);
          setHistory([project.geometryData]);
          setCurrentIndex(0);
        }
      } catch (error) {
        console.error("خطأ أثناء تحميل المشروع من الداتا بيز المحلية:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProject();
  }, [projectId]);

  // 2. تحديث الحالة وإضافة خطوة جديدة للتاريخ (تلقائي الحفظ في Dexie.js)
  const updateGeometry = async (newGeometry: any, projectName?: string) => {
    const updatedHistory = history.slice(0, currentIndex + 1);
    
    // حفظ التحديث في الذاكرة المؤقتة للـ Undo/Redo
    setHistory([...updatedHistory, newGeometry]);
    setCurrentIndex(updatedHistory.length);

    // حفظ تلقائي فوري في التخزين المحلي الآمن (Offline Storage)
    const targetName = projectName || currentProject?.name || 'تصميم_جديد';
    try {
      const savedId = await StorageBridge.saveProjectToDB(targetName, newGeometry);
      if (!currentProject?.id) {
        setCurrentProject({ id: savedId, name: targetName, timestamp: Date.now(), geometryData: newGeometry });
      }
    } catch (error) {
      console.error("فشل الحفظ التلقائي في بيئة سطح المكتب:", error);
    }
  };

  // 3. عمليات التراجع والإعادة (Undo / Redo) فائقة السرعة
  const undo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      return history[currentIndex - 1];
    }
    return null;
  };

  const redo = () => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return history[currentIndex + 1];
    }
    return null;
  };

  // 4. تصدير ملفات التصنيع (G-Code أو STL) عبر نظام Windows مباشرة
  const exportManufacturingFile = async (fileContent: string | Uint8Array, extension: 'gcode' | 'stl' | 'py' | 'nc') => {
    const defaultName = `${currentProject?.name || 'MecaFlow_Output'}.${extension}`;
    const isBinary = extension === 'stl';
    
    // استدعاء الويندوز دايلوج لحفظ الملف
    const success = await StorageBridge.exportNativeFile(fileContent, defaultName, isBinary);
    if (success) {
      console.log(`تم تصدير ملف ${extension.toUpperCase()} بنجاح إلى الجهاز.`);
    } else {
      console.log("تم إلغاء عملية التصدير بواسطة المستخدم.");
    }
  };

  return {
    currentGeometry: history[currentIndex] || null,
    updateGeometry,
    undo,
    redo,
    exportManufacturingFile,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    isLoading
  };
}
