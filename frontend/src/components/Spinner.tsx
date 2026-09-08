export default function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
