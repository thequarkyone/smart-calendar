import { useNavigate } from '../NavigationContext.js';

export function WidgetsLink() {
  const navigate = useNavigate();
  return (
    <p className="text-xs text-slate-500 border-t border-slate-800 pt-3 mt-2">
      To show or hide this on your display,{' '}
      <button
        type="button"
        className="text-blue-400 hover:underline"
        onClick={() => navigate('tiles')}
      >
        go to Widgets →
      </button>
    </p>
  );
}
