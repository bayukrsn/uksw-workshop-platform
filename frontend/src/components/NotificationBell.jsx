import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client'

// Notification config per message type
const NOTIF_CONFIG = {
    WORKSHOP_CREATED: {
        icon: 'menu_book',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        title: 'New Workshop Available',
        format: (p) => `"${p.name}" (${p.workshopType || 'General'}) has been added${p.date ? ` on ${p.date}` : ''}.`,
    },
    QUOTA_UPDATED: {
        icon: 'people',
        color: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/20',
        title: 'Seat Quota Updated',
        format: (p) => `A workshop's quota has been updated to ${p.quota} seats.`,
    },
    APPROVAL_REQUEST: {
        icon: 'person_add',
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/20',
        title: 'New Registration Request',
        format: (p) => `${p.name} (NIM: ${p.nim}) is waiting for your approval.`,
    },
    PASSWORD_RESET_REQUEST: {
        icon: 'lock_reset',
        color: 'text-yellow-400',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/20',
        title: 'Password Reset Request',
        format: (p) => `Student with NIM ${p.nim} has requested a password reset.`,
    },
    AI_SUGGESTION_READY: {
        icon: 'auto_awesome',
        color: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        title: 'AI Insights Ready',
        format: (p) => `${p.count} workshop suggestion${p.count !== 1 ? 's' : ''} generated. Check AI Insights tab.`,
    },
}

function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

const STORAGE_KEY = 'app_notifications'
const HANDLED_TYPES = Object.keys(NOTIF_CONFIG)

// Role-based type filter
const MENTOR_TYPES = new Set(['WORKSHOP_CREATED', 'QUOTA_UPDATED', 'APPROVAL_REQUEST', 'PASSWORD_RESET_REQUEST', 'AI_SUGGESTION_READY'])
const STUDENT_TYPES = new Set(['WORKSHOP_CREATED', 'QUOTA_UPDATED'])

export default function NotificationBell({ role = 'STUDENT' }) {
    const [notifications, setNotifications] = useState(() => {
        try {
            return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
        } catch {
            return []
        }
    })
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef(null)
    const allowedTypes = role === 'MENTOR' ? MENTOR_TYPES : STUDENT_TYPES

    // Persist to sessionStorage whenever notifications change
    useEffect(() => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    }, [notifications])

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    const handleWSMessage = useCallback((msg) => {
        if (!HANDLED_TYPES.includes(msg.type)) return
        if (!allowedTypes.has(msg.type)) return

        const config = NOTIF_CONFIG[msg.type]
        const notif = {
            id: `${msg.type}-${Date.now()}-${Math.random()}`,
            type: msg.type,
            title: config.title,
            body: config.format(msg.payload || {}),
            ts: Date.now(),
            read: false,
        }
        setNotifications(prev => [notif, ...prev].slice(0, 50)) // keep max 50
    }, [allowedTypes])

    // Subscribe to WS
    useEffect(() => {
        api.connectWebSocket(handleWSMessage)
        return () => api.disconnectWebSocket(handleWSMessage)
    }, [handleWSMessage])

    const unread = notifications.filter(n => !n.read).length

    const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    const clearAll = () => setNotifications([])
    const dismiss = (id) => setNotifications(prev => prev.filter(n => n.id !== id))
    const markRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))

    const handleOpen = () => {
        setIsOpen(o => !o)
        if (!isOpen) markAllRead()
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell button */}
            <button
                id="notification-bell-btn"
                onClick={handleOpen}
                className="relative p-2 rounded-xl hover:bg-accent-dark transition-colors group"
                aria-label={`Notifications (${unread} unread)`}
            >
                <span className={`material-symbols-outlined text-xl transition-colors ${unread > 0 ? 'text-primary' : 'text-text-muted group-hover:text-white'}`}>
                    {unread > 0 ? 'notifications_active' : 'notifications'}
                </span>
                {unread > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-black text-white flex items-center justify-center leading-none animate-pulse">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-surface-dark border border-border-dark rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden opacity-100">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border-dark">
                        <h3 className="font-bold text-white text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-base">notifications</span>
                            Notifications
                            {notifications.length > 0 && (
                                <span className="text-xs text-text-muted font-normal">({notifications.length})</span>
                            )}
                        </h3>
                        {notifications.length > 0 && (
                            <button
                                onClick={clearAll}
                                className="text-xs text-text-muted hover:text-red-400 transition-colors flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete_sweep</span>
                                Clear all
                            </button>
                        )}
                    </div>

                    {/* Notification list */}
                    <div className="max-h-96 overflow-y-auto divide-y divide-border-dark/50">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                                <span className="material-symbols-outlined text-text-muted text-4xl">notifications_off</span>
                                <p className="text-text-muted text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.map(n => {
                                const cfg = NOTIF_CONFIG[n.type] || {}
                                return (
                                    <div
                                        key={n.id}
                                        onClick={() => markRead(n.id)}
                                        className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent-dark/60 cursor-pointer ${!n.read ? 'bg-accent-dark/40' : ''}`}
                                    >
                                        {/* Icon */}
                                        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg} ${cfg.border}`}>
                                            <span className={`material-symbols-outlined ${cfg.color}`} style={{ fontSize: '16px' }}>
                                                {cfg.icon}
                                            </span>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-xs font-bold leading-snug ${!n.read ? 'text-white' : 'text-text-muted'}`}>
                                                    {n.title}
                                                </p>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                                                    className="text-text-muted hover:text-white flex-shrink-0 mt-0.5"
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                                                </button>
                                            </div>
                                            <p className="text-xs text-text-muted leading-relaxed mt-0.5">{n.body}</p>
                                            <p className="text-[10px] text-text-muted/60 mt-1">{timeAgo(n.ts)}</p>
                                        </div>

                                        {/* Unread dot */}
                                        {!n.read && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
