import * as React from 'react';

// Every popup is draggable by its title bar and closes when the user
// clicks outside it.
export const Popup = ({ title, onClose, children }) => {
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef(null);

  const onPointerDown = (e) => {
    drag.current = { startX: e.clientX - offset.x, startY: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setOffset({ x: e.clientX - drag.current.startX, y: e.clientY - drag.current.startY });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="popup-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="popup"
        role="dialog"
        aria-label={title}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className="popup-title"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {title}
        </div>
        <div className="popup-body">{children}</div>
      </div>
    </div>
  );
};
