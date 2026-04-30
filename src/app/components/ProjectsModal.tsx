import React, { useState } from 'react';
import { X, Folder, Plus, Check, Edit2, Loader2, Play, Trash2 } from 'lucide-react';
import { Project } from '../App';

interface ProjectsModalProps {
  projects: Project[];
  activeProjectId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, description: string) => Promise<void>;
  onUpdateProject: (id: string, name: string, description: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

const NAME_MAX_LENGTH = 30;
const DESCRIPTION_MAX_LENGTH = 100;

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  projects,
  activeProjectId,
  isOpen,
  onClose,
  onSelectProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [tempName, setTempName] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleStartCreate = () => {
    setTempName('');
    setTempDesc('');
    setIsCreating(true);
    setEditingId(null);
  };

  const handleStartEdit = (p: Project) => {
    setTempName(p.name);
    setTempDesc(p.description);
    setEditingId(p.id);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!tempName.trim()) return;
    setIsSaving(true);
    try {
      if (isCreating) {
        await onCreateProject(tempName.trim(), tempDesc.trim());
      } else if (editingId) {
        await onUpdateProject(editingId, tempName.trim(), tempDesc.trim());
      }
      setIsCreating(false);
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setIsCreating(false);
    setEditingId(null);
  };

  return (
    <div className="workspaces-modal-shell animate-in fade-in duration-300">
      <div className="workspaces-modal-overlay" onClick={onClose} />

      <section className="workspaces-modal animate-in zoom-in-95 duration-300" role="dialog" aria-modal="true" aria-labelledby="workspaces-title">
        <button onClick={onClose} className="workspaces-modal-close" aria-label="Fechar workspaces">
          <X size={24} />
        </button>

        <header className="workspaces-modal-header">
          <div className="workspaces-modal-heading">
            <div className="workspaces-modal-icon">
              <Folder size={28} />
            </div>
            <div>
              <h2 id="workspaces-title">Workspaces</h2>
              <p>Gerencie seus mapas mentais</p>
            </div>
          </div>

          {!isCreating && !editingId && (
            <button onClick={handleStartCreate} className="workspaces-new-button">
              <Plus size={17} />
              Novo
            </button>
          )}
        </header>

        <div className="workspaces-modal-content custom-scrollbar">
          {(isCreating || editingId) && (
            <form
              className="workspaces-edit-card animate-in slide-in-from-top-4"
              onSubmit={event => {
                event.preventDefault();
                handleSave();
              }}
            >
              <div className="workspaces-edit-card-header">
                <div className="workspaces-edit-icon">
                  <Edit2 size={22} />
                </div>
                <div>
                  <h3>{isCreating ? 'Novo projeto' : 'Editar projeto'}</h3>
                  <p>{isCreating ? 'Crie um novo mapa mental' : 'Altere os dados do seu mapa mental'}</p>
                </div>
              </div>

              <div className="workspaces-field-group">
                <label className="workspaces-field-label" htmlFor="workspace-name">
                  <span>Nome do workspace</span>
                  <strong>{tempName.length}/{NAME_MAX_LENGTH}</strong>
                </label>
                <input
                  id="workspace-name"
                  autoFocus
                  placeholder="Ex: Planejamento Q2"
                  maxLength={NAME_MAX_LENGTH}
                  value={tempName}
                  onChange={e => setTempName(e.target.value)}
                  className="workspaces-input"
                />
              </div>

              <div className="workspaces-field-group">
                <label className="workspaces-field-label" htmlFor="workspace-description">
                  <span>Descrição</span>
                  <strong>{tempDesc.length}/{DESCRIPTION_MAX_LENGTH}</strong>
                </label>
                <input
                  id="workspace-description"
                  placeholder="Nome completo ou contexto do mapa mental"
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  value={tempDesc}
                  onChange={e => setTempDesc(e.target.value)}
                  className="workspaces-input"
                />
              </div>

              <div className="workspaces-form-actions">
                <button type="button" onClick={cancelEdit} className="workspaces-secondary-button">
                  Cancelar
                </button>
                <button type="submit" disabled={!tempName.trim() || isSaving} className="workspaces-primary-button">
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Salvar alterações
                </button>
              </div>
            </form>
          )}

          {!isCreating && projects.map(proj => {
            const isActive = proj.id === activeProjectId;
            return (
              <article key={proj.id} className={`workspaces-project-card ${isActive ? 'is-active' : ''}`}>
                <div className="workspaces-project-main">
                  <div className="workspaces-project-icon">
                    <Folder size={28} />
                  </div>

                  <div className="workspaces-project-copy">
                    <h3>{proj.name}</h3>
                    <p>{proj.description || 'Sem descrição'}</p>
                  </div>
                </div>

                <div className="workspaces-project-actions">
                  {isActive && (
                    <span className="workspaces-active-badge">
                      <span />
                      Ativo
                    </span>
                  )}

                  <button
                    onClick={() => handleStartEdit(proj)}
                    className="workspaces-icon-button"
                    title="Editar"
                    aria-label={`Editar ${proj.name}`}
                  >
                    <Edit2 size={17} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir o workspace "${proj.name}"?`)) {
                        void onDeleteProject(proj.id);
                      }
                    }}
                    className="workspaces-icon-button is-danger"
                    title="Excluir"
                    aria-label={`Excluir ${proj.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                  {!isActive && (
                    <button
                      onClick={() => onSelectProject(proj.id)}
                      className="workspaces-icon-button is-primary"
                      title="Acessar Workspace"
                      aria-label={`Acessar ${proj.name}`}
                    >
                      <Play size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
