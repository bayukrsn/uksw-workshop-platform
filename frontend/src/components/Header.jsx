import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import NotificationBell from './NotificationBell'

export default function Header({ title = 'UKSW Workshops Platform' }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const handleLogout = async () => {
        logout()
        navigate('/')
    }

    return (
        <header className="flex items-center justify-between whitespace-nowrap border-b border-border-dark bg-background-dark/95 backdrop-blur-sm px-6 py-3 sticky top-0 z-50">
            <div className="flex items-center gap-3 text-white">
                <div className="size-8 flex items-center justify-center bg-primary/20 rounded-lg text-primary">
                    <span className="material-symbols-outlined text-[20px]">school</span>
                </div>
                <h2 className="text-white text-lg font-bold leading-tight tracking-tight hidden sm:block">
                    {title}
                </h2>
            </div>

            <div className="flex items-center gap-4">
                {user && user.role === 'STUDENT' && (
                    <button
                        onClick={() => navigate('/history')}
                        className="flex items-center gap-2 rounded-lg bg-surface-dark border border-border-dark px-4 py-2 text-sm font-bold text-text-muted hover:text-white hover:border-primary transition-all group"
                    >
                        <span className="material-symbols-outlined text-[20px] group-hover:text-primary transition-colors">history_edu</span>
                        <span className="hidden sm:inline">Enrollment History</span>
                    </button>
                )}

                {user && (
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden md:block">
                            <p className="text-sm font-bold text-white">{user.name}</p>
                            <p className="text-xs text-text-muted">{user.nim || user.nidn}</p>
                        </div>
                        <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                            {user.name?.charAt(0) || 'U'}
                        </div>
                    </div>
                )}

                <NotificationBell role={user?.role || 'STUDENT'} />

                <button
                    onClick={handleLogout}
                    className="flex gap-2 cursor-pointer items-center justify-center rounded-lg h-9 px-4 bg-transparent border border-border-dark hover:border-primary text-text-muted hover:text-white transition-colors text-sm font-medium"
                >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    <span className="hidden sm:inline">Logout</span>
                </button>
            </div>
        </header>
    )
}
