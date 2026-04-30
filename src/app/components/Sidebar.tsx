import { useState } from 'react';
import {
  Plus,
  Folder,
  FolderOpen,
  Trash2,
  Brain,
  Sparkles,
  Network,
  Layers,
  ZoomIn,
  ZoomOut,
  ScanSearch,
  RotateCcw
} from 'lucide-react';

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  categories: Array<{ name: string; color: string }>;
  selectedCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
  ideaCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitView: () => void;
  aiMode: boolean;
  onToggleAiMode: () => void;
}

export function Sidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onDeleteProject,
  categories,
  selectedCategory,
  onSelectCategory,
  ideaCount,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitView,
  aiMode,
  onToggleAiMode
}: SidebarProps) {
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [hoveredProject, setHoveredProject] = useState<string | null>(null);

  const handleAddProject = () => {
    if (newProjectName.trim()) {
      onAddProject(newProjectName.trim());
      setNewProjectName('');
      setIsAddingProject(false);
    }
  };

  return (
    <aside
      className="flex flex-col h-full select-none"
      style={{
        width: '320px',
        minWidth: '320px',
        background: 'linear-gradient(180deg, #0d1117 0%, #0a0e17 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)'
      }}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 48,
              height: 48,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
            }}
          >
            <Network size={24} className="text-white" />
          </div>
          <div>
            <div className="text-xl font-bold text-white tracking-tight">Think</div>
            <div className="text-xs text-slate-500 font-medium tracking-widest uppercase">Flow</div>
          </div>
        </div>
      </div>

      {/* Projects Section */}
      <div className="flex-1 overflow-y-auto px-3 py-4" style={{ scrollbarWidth: 'none' }}>
        {/* Projects Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Projetos</span>
          <button
            onClick={() => setIsAddingProject(true)}
            className="p-1 rounded-md transition-all hover:bg-slate-800 text-slate-500 hover:text-slate-300"
            title="Novo projeto"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Add Project Input */}
        {isAddingProject && (
          <div className="mb-3 flex gap-2">
            <input
              autoFocus
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddProject();
                if (e.key === 'Escape') setIsAddingProject(false);
              }}
              placeholder="Nome do projeto..."
              className="flex-1 px-3 py-2 text-sm rounded-lg text-slate-100 placeholder-slate-600 outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}
            />
            <button
              onClick={handleAddProject}
              className="px-4 rounded-lg text-sm font-medium text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              OK
            </button>
          </div>
        )}

        {/* Project List */}
        <div className="space-y-1 mb-6">
          {projects.length === 0 && (
            <div className="text-center py-6">
              <Folder size={32} className="mx-auto text-slate-700 mb-2" />
              <p className="text-xs text-slate-600">Nenhum projeto ainda</p>
            </div>
          )}
          {projects.map(project => {
            const isActive = project.id === activeProjectId;
            return (
              <div
                key={project.id}
                className="group/proj flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                style={{
                  background: isActive
                    ? `${project.color}18`
                    : hoveredProject === project.id
                    ? 'rgba(255,255,255,0.04)'
                    : 'transparent',
                  border: isActive ? `1px solid ${project.color}30` : '1px solid transparent'
                }}
                onClick={() => onSelectProject(project.id)}
                onMouseEnter={() => setHoveredProject(project.id)}
                onMouseLeave={() => setHoveredProject(null)}
              >
                {isActive ? (
                  <FolderOpen size={18} style={{ color: project.color }} />
                ) : (
                  <Folder size={18} className="text-slate-500" />
                )}
                <span
                  className="flex-1 text-sm font-medium truncate"
                  style={{ color: isActive ? project.color : '#94a3b8' }}
                >
                  {project.name}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteProject(project.id); }}
                  className="opacity-0 group-hover/proj:opacity-100 p-1 rounded transition-all text-slate-600 hover:text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t mb-4" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />

        {/* Categories Filter */}
        <div className="mb-3 px-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Filtrar por tipo</span>
        </div>
        <div className="space-y-1 mb-6">
          <button
            onClick={() => onSelectCategory(null)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left"
            style={{
              background: selectedCategory === null ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: selectedCategory === null ? '#e2e8f0' : '#64748b'
            }}
          >
            <div className="size-3 rounded-full bg-slate-500" />
            <span className="text-sm font-medium">Todos os balões</span>
          </button>
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => onSelectCategory(cat.name)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left"
              style={{
                background: selectedCategory === cat.name ? `${cat.color}18` : 'transparent',
                color: selectedCategory === cat.name ? cat.color : '#64748b',
                border: selectedCategory === cat.name ? `1px solid ${cat.color}30` : '1px solid transparent'
              }}
            >
              <div className="size-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />
              <span className="text-sm font-medium">{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t mb-4" style={{ borderColor: 'rgba(255,255,255,0.05)' }} />

        {/* AI Mode Toggle */}
        <div
          className="flex items-center justify-between px-4 py-3.5 rounded-xl mb-4 cursor-pointer transition-all"
          style={{
            background: aiMode
              ? 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))'
              : 'rgba(255,255,255,0.04)',
            border: aiMode ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)'
          }}
          onClick={onToggleAiMode}
        >
          <div className="flex items-center gap-3">
            <Brain size={18} className={aiMode ? 'text-purple-400' : 'text-slate-500'} />
            <span className="text-sm font-semibold" style={{ color: aiMode ? '#c4b5fd' : '#64748b' }}>
              Modo IA
            </span>
          </div>
          <div
            className="relative w-11 h-6 rounded-full transition-all flex items-center"
            style={{ background: aiMode ? '#7c3aed' : 'rgba(255,255,255,0.1)' }}
          >
            <div
              className="absolute size-4 bg-white rounded-full shadow transition-transform"
              style={{ left: 4, transform: aiMode ? 'translateX(20px)' : 'translateX(0)' }}
            />
          </div>
        </div>
      </div>

      {/* Bottom: Zoom & Stats */}
      <div className="border-t px-4 py-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {/* Stats */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-slate-600" />
            <span className="text-xs font-medium text-slate-500">{ideaCount} balões</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-purple-700" />
            <span className="text-xs font-medium text-slate-500">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onZoomOut}
            className="flex-1 flex items-center justify-center py-2.5 rounded-lg transition-all text-slate-500 hover:text-slate-200 hover:bg-slate-800"
            title="Diminuir zoom"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={onResetView}
            className="flex-1 flex items-center justify-center py-2.5 rounded-lg transition-all text-slate-500 hover:text-slate-200 hover:bg-slate-800"
            title="Resetar visão"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={onFitView}
            className="flex-1 flex items-center justify-center py-2.5 rounded-lg transition-all text-slate-500 hover:text-slate-200 hover:bg-slate-800"
            title="Ajustar à tela"
          >
            <ScanSearch size={16} />
          </button>
          <button
            onClick={onZoomIn}
            className="flex-1 flex items-center justify-center py-2.5 rounded-lg transition-all text-slate-500 hover:text-slate-200 hover:bg-slate-800"
            title="Aumentar zoom"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
