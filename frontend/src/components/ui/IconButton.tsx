import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function IconButton({ children, className = "", ...props }: IconButtonProps) {
  return (
    <button className={`ui-icon-button ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}

