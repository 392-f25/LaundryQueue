type NotificationBannerProps = {
  message: string;
  onDismiss: () => void;
};

export const NotificationBanner = ({ message, onDismiss }: NotificationBannerProps) => {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="ml-3 px-5 py-3 rounded-lg bg-amber-400 text-black font-extrabold text-xl md:text-2xl shadow-lg border-2 border-amber-600 animate-pulse hover:animate-none focus:outline-none focus:ring-4 focus:ring-amber-300"
    >
      🚨 {message}
    </button>
  );
};

export default NotificationBanner;
