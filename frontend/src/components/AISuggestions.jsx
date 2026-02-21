import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

const TYPE_COLORS = {
    Technical: { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400' },
    Creative: { bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-400' },
    Business: { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400' },
    Leadership: { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-400' },
    General: { bg: 'bg-gray-500/20', border: 'border-gray-500/30', text: 'text-gray-400' },
}

function formatDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function AISuggestions({ onCreateWorkshop }) {
    const [loading, setLoading] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [suggestions, setSuggestions] = useState(null)
    const [feedbackMeta, setFeedbackMeta] = useState(null)
    const [cacheInfo, setCacheInfo] = useState(null)   // { cachedAt, expiresAt }
    const [error, setError] = useState(null)

    // Auto-load on mount: cache-first
    const loadSuggestions = useCallback(async (refresh = false) => {
        if (refresh) setRefreshing(true)
        else setLoading(true)
        setError(null)

        try {
            const res = await api.getAISuggestions(refresh)
            if (res.success) {
                setSuggestions(res.suggestions || [])
                setFeedbackMeta(res.feedback)
                setCacheInfo({ cachedAt: res.cachedAt, expiresAt: res.expiresAt })
            } else {
                setError('Failed to load suggestions.')
            }
        } catch (err) {
            setError(err.message || 'Something went wrong.')
            console.error('AI suggestions error:', err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    // Auto-trigger cache-first lookup when tab mounts
    useEffect(() => {
        loadSuggestions(false)
    }, [loadSuggestions])

    const typeColors = (type) => TYPE_COLORS[type] || TYPE_COLORS.General

    return (
        <div className="flex flex-col gap-6 p-1">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">auto_awesome</span>
                        AI Workshop Insights
                    </h2>
                    <p className="text-sm text-text-muted mt-1">
                        Analyzes the {feedbackMeta?.workshopCount ?? 'last'} most recently completed workshops to recommend new ideas.
                    </p>
                </div>
                <button
                    id="ai-generate-btn"
                    onClick={() => loadSuggestions(true)}
                    disabled={loading || refreshing}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-sm transition-all hover:bg-primary/80 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {refreshing ? (
                        <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Generating New...
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-sm">refresh</span>
                            {suggestions ? 'Refresh Insights' : 'Generate Insights'}
                        </>
                    )}
                </button>
            </div>

            {/* Cache info banner */}
            {cacheInfo && (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-accent-dark border border-border-dark text-sm">
                    <span className="material-symbols-outlined text-primary text-base">database</span>
                    <span className="text-text-muted">
                        Cached on{' '}
                        <span className="text-white font-medium">{formatDate(cacheInfo.cachedAt)}</span>
                        {' · '}Expires{' '}
                        <span className="text-white font-medium">{formatDate(cacheInfo.expiresAt)}</span>
                    </span>
                </div>
            )}

            {/* Feedback meta */}
            {feedbackMeta && feedbackMeta.workshopCount > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-dark border border-border-dark text-sm">
                    <span className="material-symbols-outlined text-primary text-base">analytics</span>
                    <span className="text-text-muted">
                        Based on{' '}
                        <span className="text-white font-bold">{feedbackMeta.totalEntries}</span>{' '}
                        review{feedbackMeta.totalEntries !== 1 ? 's' : ''} from the last{' '}
                        <span className="text-white font-bold">{feedbackMeta.workshopCount}</span>{' '}
                        completed workshop{feedbackMeta.workshopCount !== 1 ? 's' : ''}
                        {feedbackMeta.workshopNames?.length > 0 && (
                            <span className="hidden md:inline">
                                {': '}
                                <span className="text-white">{feedbackMeta.workshopNames.join(', ')}</span>
                            </span>
                        )}
                    </span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                    <span className="material-symbols-outlined text-base">error</span>
                    {error}
                </div>
            )}

            {/* Initial loading skeleton */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-accent-dark border border-border-dark rounded-2xl p-5 flex flex-col gap-4 animate-pulse">
                            <div className="h-4 bg-white/10 rounded-lg w-2/3" />
                            <div className="h-3 bg-white/10 rounded w-1/3" />
                            <div className="h-14 bg-white/10 rounded-lg" />
                            <div className="h-9 bg-white/10 rounded-xl" />
                        </div>
                    ))}
                </div>
            )}

            {/* Suggestion Cards — overlaid with subtle shimmer while refreshing */}
            {!loading && suggestions && suggestions.length > 0 && (
                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${refreshing ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                    {suggestions.map((s, idx) => {
                        const colors = typeColors(s.workshopType)
                        return (
                            <div
                                key={idx}
                                className="bg-accent-dark border border-border-dark rounded-2xl p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors duration-200"
                            >
                                {/* Type badge */}
                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold w-fit border ${colors.bg} ${colors.border} ${colors.text}`}>
                                    <span className="material-symbols-outlined text-xs" style={{ fontSize: '14px' }}>
                                        {s.workshopType === 'Technical' ? 'code' : s.workshopType === 'Creative' ? 'palette' : s.workshopType === 'Business' ? 'business_center' : s.workshopType === 'Leadership' ? 'star' : 'school'}
                                    </span>
                                    {s.workshopType}
                                </div>

                                <h3 className="text-white font-bold text-base leading-snug">{s.name}</h3>
                                <p className="text-text-muted text-sm leading-relaxed flex-1">{s.rationale}</p>

                                {s.inspiredBy && (
                                    <div className="flex items-center gap-2 text-xs text-text-muted">
                                        <span className="material-symbols-outlined text-primary" style={{ fontSize: '14px' }}>lightbulb</span>
                                        <span>{s.inspiredBy}</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-3 text-xs text-text-muted border-t border-border-dark pt-3">
                                    <span className="flex items-center gap-1">
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>credit_card</span>
                                        {s.credits} Credits
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>people</span>
                                        {s.quota} Seats
                                    </span>
                                </div>

                                <button
                                    onClick={() => onCreateWorkshop({
                                        name: s.name,
                                        workshopType: s.workshopType,
                                        credits: s.credits,
                                        quota: s.quota,
                                    })}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary font-semibold text-sm hover:bg-primary hover:text-white transition-all duration-200 active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-sm" style={{ fontSize: '16px' }}>add_circle</span>
                                    Create This Workshop
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Refreshing overlay spinner */}
            {refreshing && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <span className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-text-muted text-sm">Asking AI for fresh suggestions...</p>
                </div>
            )}

            {/* Empty state */}
            {!loading && !refreshing && !suggestions && !error && (
                <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-3xl">auto_awesome</span>
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-lg">Loading insights...</h3>
                        <p className="text-text-muted text-sm mt-1 max-w-sm">Checking for cached suggestions.</p>
                    </div>
                </div>
            )}

            {!loading && !refreshing && suggestions && suggestions.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <span className="material-symbols-outlined text-text-muted text-4xl">sentiment_neutral</span>
                    <p className="text-text-muted text-sm">No suggestions could be generated. Try again later.</p>
                </div>
            )}
        </div>
    )
}
