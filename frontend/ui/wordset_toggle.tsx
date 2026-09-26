import * as React from 'react';

const WordSetToggle = ({ label, selected, onToggle }) => {
  return (
    <div
      className={selected ? 'btn-wordsettoggle selected' : 'btn-wordsettoggle'}
      onClick={onToggle}
      role="checkbox"
      aria-checked={!!selected}
    >
      {label}
    </div>
  );
};

export default WordSetToggle;
