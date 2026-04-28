import { X, CheckCircle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { usePanelContext } from '../../contexts/PanelContext'

export default function SuccessNotifications() {
  const { successNotifications, removeSuccessNotification } = usePanelContext()
  const [closingIds, setClosingIds] = useState(new Set())
  const [notificationHeights, setNotificationHeights] = useState({})
  const notificationRefs = useRef({})

  // Measure notification heights
  useEffect(() => {
    const heights = {}
    successNotifications.forEach(notification => {
      const element = notificationRefs.current[notification.id]
      if (element) {
        heights[notification.id] = element.offsetHeight
      }
    })
    setNotificationHeights(heights)
  }, [successNotifications])

  // Auto-dismiss notifications after 3 seconds
  useEffect(() => {
    successNotifications.forEach(notification => {
      const timerId = setTimeout(() => {
        handleClose(notification.id)
      }, 3000)
      
      // Store timer ID to clean up if notification is manually closed
      return () => clearTimeout(timerId)
    })
  }, [successNotifications])

  const handleClose = (id) => {
    // Prevent double-closing
    if (closingIds.has(id)) return
    
    // Add to closing set to trigger exit animation
    setClosingIds(prev => new Set(prev).add(id))
    
    // Remove after animation completes (400ms to match animation duration)
    setTimeout(() => {
      removeSuccessNotification(id)
      setClosingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }, 400)
  }

  // Calculate cumulative top position for each notification
  const calculateTopPosition = (index) => {
    let top = 120 // Starting position from top
    for (let i = 0; i < index; i++) {
      const prevNotification = successNotifications[i]
      const height = notificationHeights[prevNotification.id] || 50 // Default height estimate
      top += height + 16 // Add notification height + 16px gap
    }
    return top
  }

  if (successNotifications.length === 0) return null

  return (
    <div className="success-notifications-container">
      {successNotifications.map((notification, index) => (
        <div
          key={notification.id}
          ref={el => notificationRefs.current[notification.id] = el}
          className={`success-notification ${closingIds.has(notification.id) ? 'success-notification-closing' : ''}`}
          style={{
            top: `${calculateTopPosition(index)}px`,
            animationDelay: '0.1s'
          }}
        >
          <div className="success-notification-content">
            <div className="success-notification-icon">
              <CheckCircle className="w-5 h-5" style={{ color: 'var(--color-green-400)' }} />
            </div>
            <div className="success-notification-message">
              {notification.message}
            </div>
            <button
              onClick={() => handleClose(notification.id)}
              className="success-notification-close"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
