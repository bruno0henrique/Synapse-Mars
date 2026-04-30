import { Idea } from '../App';

interface CategoryFilterProps {
  categories: Array<{ name: string; color: string; bgColor: string }>;
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  ideas: Idea[];
}

export function CategoryFilter({ categories, selectedCategory, onSelectCategory, ideas }: CategoryFilterProps) {
  const getCategoryCount = (categoryName: string) => {
    return ideas.filter(idea => idea.category === categoryName).length;
  };

  return (
    <div style={{ padding: '12px 16px', gap: '8px', display: 'flex', flexWrap: 'wrap', marginTop: '16px' }}>
      <button
        onClick={() => onSelectCategory(null)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${selectedCategory === null
            ? 'bg-slate-700 text-white shadow-md border-slate-600'
            : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 border-slate-700'
          }`}
      >
        Todos ({ideas.length})
      </button>

      {categories.map(category => {
        const count = getCategoryCount(category.name);
        return (
          <button
            key={category.name}
            onClick={() => onSelectCategory(category.name)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${selectedCategory === category.name
                ? 'shadow-lg ring-2'
                : 'hover:shadow-sm opacity-80 hover:opacity-100'
              }`}
            style={{
              backgroundColor: selectedCategory === category.name ? category.color : category.color + '30',
              color: selectedCategory === category.name ? 'white' : category.color,
              borderColor: category.color,
              borderWidth: '1px',
            }}
          >
            {category.name} ({count})
          </button>
        );
      })}
    </div>
  );
}
