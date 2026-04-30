import React from 'react';
import {
  X,
  Activity,
  BarChart3,
  FolderOpen,
  GitBranch,
  Lightbulb,
  Network,
  Sparkles,
  Target,
  Users
} from 'lucide-react';
import { Idea } from '../App';

interface StatisticsModalProps {
  ideas: Idea[];
  isOpen: boolean;
  onClose: () => void;
}

type Tone = 'purple' | 'green' | 'blue' | 'pink';
type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  Icon: IconComponent;
  tone: Tone;
  featured?: boolean;
}

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

function getMapDepth(ideas: Idea[]) {
  if (ideas.length < 2) return 0;

  const ids = new Set(ideas.map(idea => idea.id));
  const graph = new Map<string, Set<string>>();

  ideas.forEach(idea => graph.set(idea.id, new Set()));
  ideas.forEach(idea => {
    idea.connections?.forEach(connectionId => {
      if (!ids.has(connectionId)) return;
      graph.get(idea.id)?.add(connectionId);
      graph.get(connectionId)?.add(idea.id);
    });
  });

  const startId = ideas.find(idea => idea.isCentral)?.id || ideas[0]?.id;
  if (!startId) return 0;

  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  const visited = new Set([startId]);
  let maxDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    maxDepth = Math.max(maxDepth, current.depth);
    graph.get(current.id)?.forEach(nextId => {
      if (visited.has(nextId)) return;
      visited.add(nextId);
      queue.push({ id: nextId, depth: current.depth + 1 });
    });
  }

  return maxDepth;
}

const MetricCard = ({ title, value, description, Icon, tone, featured }: MetricCardProps) => (
  <article className={cx('map-stats-metric', `map-stats-tone-${tone}`, featured && 'is-featured')}>
    <div className="map-stats-metric-top">
      <span className="map-stats-icon-box" aria-hidden="true">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
    </div>

    <strong className="map-stats-metric-value">{value}</strong>
    <p>{description}</p>
  </article>
);

export const StatisticsModal: React.FC<StatisticsModalProps> = ({ ideas, isOpen, onClose }) => {
  if (!isOpen) return null;

  const totalIdeas = ideas.length;
  const aiGeneratedCount = ideas.filter(idea => idea.aiGenerated).length;
  const humanGeneratedCount = totalIdeas - aiGeneratedCount;
  const humanPercentage = totalIdeas ? Math.round((humanGeneratedCount / totalIdeas) * 100) : 0;
  const aiPercentage = totalIdeas ? 100 - humanPercentage : 0;

  const categoryCounts = ideas.reduce((acc: Record<string, number>, idea) => {
    const category = idea.category || 'Outro';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const topCategories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const totalConnections = ideas.reduce((acc, idea) => acc + (idea.connections?.length || 0), 0);
  const mapDepth = getMapDepth(ideas);
  const maxPossibleConnections = totalIdeas > 1 ? totalIdeas * (totalIdeas - 1) : 0;
  const densityPercent = maxPossibleConnections
    ? Math.min(100, Math.round((totalConnections / maxPossibleConnections) * 100))
    : 0;
  const hasIdeas = totalIdeas > 0;
  const hasConnections = totalConnections > 0;

  return (
    <div className="map-stats-shell animate-in fade-in duration-300">
      <div className="map-stats-overlay" onClick={onClose} />

      <section
        className="map-stats-panel animate-in zoom-in-95 duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-stats-title"
      >
        <header className="map-stats-header">
          <div className="map-stats-title-group">
            <span className="map-stats-header-icon" aria-hidden="true">
              <Activity size={32} />
            </span>
            <div>
              <h2 id="map-stats-title">Estatísticas do Mapa</h2>
              <p>Visão geral do seu mapa mental</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="map-stats-close" aria-label="Fechar estatísticas">
            <X size={28} />
          </button>
        </header>

        <div className="map-stats-content custom-scrollbar">
          <div className="map-stats-metrics-grid">
            <MetricCard
              title="Total de Ideias"
              value={totalIdeas}
              description={hasIdeas ? 'Ideias adicionadas ao mapa.' : 'Comece adicionando sua primeira ideia.'}
              Icon={Lightbulb}
              tone="purple"
              featured={!hasIdeas}
            />
            <MetricCard
              title="Conexões"
              value={totalConnections}
              description="Relações entre ideias."
              Icon={GitBranch}
              tone="green"
            />
            <MetricCard
              title="Profundidade"
              value={mapDepth}
              description="Níveis de profundidade atingidos."
              Icon={Target}
              tone="blue"
            />
            <MetricCard
              title="Densidade"
              value={`${densityPercent}%`}
              description="Conexões por nó (média)."
              Icon={BarChart3}
              tone="pink"
            />
          </div>

          <div className="map-stats-main-grid">
            <article className="map-stats-card map-stats-authorship">
              <header className="map-stats-card-header">
                <span className="map-stats-card-icon map-stats-tone-purple" aria-hidden="true">
                  <Users size={27} />
                </span>
                <h3>Humano vs IA</h3>
              </header>

              <div className="map-stats-card-body">
                {!hasIdeas ? (
                  <div className="map-stats-empty">
                    <div className="map-stats-empty-art" aria-hidden="true">
                      <Users size={58} />
                      <Sparkles className="map-stats-empty-sparkle" size={18} />
                    </div>
                    <h4>Nenhuma ideia ainda</h4>
                    <p>Adicione ideias ou use IA para começar</p>
                  </div>
                ) : (
                  <div className="map-stats-auth-data">
                    <div className="map-stats-auth-counts">
                      <div>
                        <span>Humano</span>
                        <strong>{humanGeneratedCount}</strong>
                      </div>
                      <div>
                        <span>IA</span>
                        <strong>{aiGeneratedCount}</strong>
                      </div>
                    </div>

                    <div className="map-stats-proportion" aria-hidden="true">
                      <span style={{ width: `${humanPercentage}%` }} />
                      <span style={{ width: `${aiPercentage}%` }} />
                    </div>
                  </div>
                )}

                <div className="map-stats-legend">
                  <div>
                    <span className="map-stats-dot is-human" />
                    <span>Humano</span>
                    <strong>{humanGeneratedCount} ({humanPercentage}%)</strong>
                  </div>
                  <div>
                    <span className="map-stats-dot is-ai" />
                    <span>IA</span>
                    <strong>{aiGeneratedCount} ({aiPercentage}%)</strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="map-stats-card">
              <header className="map-stats-card-header">
                <span className="map-stats-card-icon map-stats-tone-purple" aria-hidden="true">
                  <FolderOpen size={27} />
                </span>
                <h3>Top Categorias</h3>
              </header>

              <div className="map-stats-card-body">
                {topCategories.length > 0 ? (
                  <div className="map-stats-category-list">
                    {topCategories.map(([category, count], index) => (
                      <div key={category} className="map-stats-category-row">
                        <div className="map-stats-category-meta">
                          <span>{category}</span>
                          <strong>{count} {count === 1 ? 'ideia' : 'ideias'}</strong>
                        </div>
                        <div className="map-stats-category-bar" aria-hidden="true">
                          <span
                            className={`is-rank-${index + 1}`}
                            style={{ width: `${(count / totalIdeas) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="map-stats-empty">
                    <div className="map-stats-empty-art" aria-hidden="true">
                      <FolderOpen size={68} />
                      <Sparkles className="map-stats-empty-sparkle" size={18} />
                    </div>
                    <h4>Nenhuma categoria ainda</h4>
                    <p>Adicione categorias às suas ideias para ver estatísticas.</p>
                  </div>
                )}
              </div>
            </article>

            <article className="map-stats-card">
              <header className="map-stats-card-header">
                <span className="map-stats-card-icon map-stats-tone-purple" aria-hidden="true">
                  <ShareIcon />
                </span>
                <h3>Networking do Mapa</h3>
              </header>

              <div className="map-stats-card-body">
                <div className="map-stats-empty">
                  <div className="map-stats-network-art" aria-hidden="true">
                    <Network size={74} />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  {hasConnections ? (
                    <>
                      <h4>{totalConnections} {totalConnections === 1 ? 'conexão no mapa' : 'conexões no mapa'}</h4>
                      <p>Suas ideias já possuem relações ativas.</p>
                    </>
                  ) : (
                    <>
                      <h4>Sem conexões ainda</h4>
                      <p>Conecte ideias para aumentar o network do seu mapa.</p>
                    </>
                  )}
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
};

const ShareIcon = () => <GitBranch size={27} />;
