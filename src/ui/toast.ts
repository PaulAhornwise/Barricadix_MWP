// Simple toast notification function
export function toastInfo(message: string) {
  console.info("ℹ️", message);
  
  // Create toast element if it doesn't exist
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #007cba;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      font-size: 14px;
      font-weight: 500;
      max-width: 300px;
      word-wrap: break-word;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  
  // Update message and show
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(0)';
  
  // Auto hide after 5 seconds
  setTimeout(() => {
    if (toast) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast && toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  }, 5000);
}

