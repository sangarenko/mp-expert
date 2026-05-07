'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Send,
  Bot,
  User,
  Sparkles,
  Store,
  ShoppingCart,
  Truck,
  ChevronDown,
  MessageCircle,
  Zap,
  BookOpen,
  GraduationCap,
  FileBarChart,
  Globe,
  RotateCcw,
  Search,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { section: string; topic: string; preview: string }[]
  blocksFound?: number
  timestamp: number
}

type TopicKey = 'all' | 'WB' | 'OZON' | 'КАРГО' | 'ОТЧЁТЫ' | 'КУРСЫ' | 'ЭВИРМА' | 'СТАТЬИ'

interface TopicConfig {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TOPICS: Record<TopicKey, TopicConfig> = {
  all: { label: 'Все', icon: MessageCircle, color: 'from-emerald-500 to-green-600' },
  WB: { label: 'WB', icon: Store, color: 'from-violet-500 to-purple-600' },
  OZON: { label: 'Ozon', icon: ShoppingCart, color: 'from-blue-500 to-cyan-600' },
  КАРГО: { label: 'Карго', icon: Truck, color: 'from-amber-500 to-orange-600' },
  ОТЧЁТЫ: { label: 'Отчёты', icon: FileBarChart, color: 'from-rose-500 to-pink-600' },
  КУРСЫ: { label: 'Курсы', icon: GraduationCap, color: 'from-teal-500 to-emerald-600' },
  ЭВИРМА: { label: 'Эвирма', icon: Globe, color: 'from-sky-500 to-indigo-600' },
  СТАТЬИ: { label: 'Статьи', icon: BookOpen, color: 'from-lime-500 to-green-600' },
}

const SUGGESTIONS = [
  { text: 'Как снизить ДРР на WB?', icon: Zap, topic: 'WB' as TopicKey },
  { text: 'Что такое CRF(L) и как его использовать?', icon: Sparkles, topic: 'WB' as TopicKey },
  { text: 'Как продвигать карточку на Ozon?', icon: ShoppingCart, topic: 'OZON' as TopicKey },
  { text: 'Как заказать товар из Китая?', icon: Truck, topic: 'КАРГО' as TopicKey },
  { text: 'Оборот WB и тренды рынка 2025?', icon: FileBarChart, topic: 'ОТЧЁТЫ' as TopicKey },
  { text: 'SEO карточки — как попасть в ТОП?', icon: BookOpen, topic: 'СТАТЬИ' as TopicKey },
  { text: 'Юнит-экономика: как считать прибыль?', icon: Search, topic: 'СТАТЬИ' as TopicKey },
  { text: 'Какие курсы по WB реально помогают?', icon: GraduationCap, topic: 'КУРСЫ' as TopicKey },
]

// Use Next.js API route (which calls BM25 Python subprocess internally)
// No need for external RAG service port

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeTopic, setActiveTopic] = useState<TopicKey>('all')
  const [expandedSources, setExpandedSources] = useState<string | null>(null)
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('checking')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Check backend health on mount
  useEffect(() => {
    const checkHealth = async () => {
      try {
        // Health check via Next.js API
        const res = await fetch('/api/chat', { method: 'HEAD' }).catch(() => null)
        // If we get any response, backend is online
        setBackendStatus('online')
      } catch {
        setBackendStatus('offline')
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  const sendMessage = useCallback(async (text?: string) => {
    const messageText = text || input.trim()
    if (!messageText || isLoading) return

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    try {
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          topic: activeTopic === 'all' ? '' : activeTopic,
          history,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()

      const assistantMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: data.answer || data.reply || 'Не удалось получить ответ от сервера.',
        sources: data.sources || [],
        blocksFound: data.blocksFound || data.sources?.length || 0,
        timestamp: Date.now(),
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errorMsg: Message = {
        id: generateId(),
        role: 'assistant',
        content: '⚠️ Ошибка соединения с сервером. Проверьте, что RAG-сервис запущен, и попробуйте ещё раз.',
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, activeTopic])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setExpandedSources(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-card animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground tracking-tight">MP Эксперт</h1>
              <p className="text-xs text-muted-foreground">AI-ассистент по маркетплейсам</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={`text-xs ${
                backendStatus === 'online'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : backendStatus === 'offline'
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  backendStatus === 'online'
                    ? 'bg-emerald-400 animate-pulse'
                    : backendStatus === 'offline'
                    ? 'bg-red-400'
                    : 'bg-yellow-400 animate-pulse'
                }`}
              />
              {backendStatus === 'online' ? 'Онлайн' : backendStatus === 'offline' ? 'Оффлайн' : 'Проверка...'}
            </Badge>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Очистить чат"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── Topic Filters ────────────────────────────────────────────────── */}
      <div className="border-b border-border/30 bg-card/30 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-2.5">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {(Object.entries(TOPICS) as [TopicKey, TopicConfig][]).map(([key, config]) => {
              const Icon = config.icon
              const isActive = activeTopic === key
              return (
                <button
                  key={key}
                  onClick={() => setActiveTopic(key)}
                  className={`
                    shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                    transition-all duration-200 whitespace-nowrap
                    ${
                      isActive
                        ? `bg-gradient-to-r ${config.color} text-white shadow-md shadow-emerald-500/10`
                        : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/50'
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {config.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Main Chat Area ───────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 max-w-4xl w-full mx-auto px-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto py-4 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
              {messages.length === 0 ? (
                /* ── Welcome Screen ── */
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                  <div className="relative mb-8">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
                      <Bot className="w-12 h-12 text-white" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  <h2 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
                    Привет! Я MP Эксперт
                  </h2>
                  <p className="text-muted-foreground mb-10 max-w-md leading-relaxed">
                    Задайте вопрос про Wildberries, Ozon, карго, логистику, SEO или налоги — 
                    я отвечу с конкретными цифрами и рекомендациями из базы знаний
                  </p>

                  {/* Suggestions grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                    {SUGGESTIONS.map((s, i) => {
                      const Icon = s.icon
                      const topicConfig = TOPICS[s.topic]
                      return (
                        <Card
                          key={i}
                          className="p-4 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-200 hover:border-emerald-500/30 text-left group bg-card/80 border-border/50"
                          onClick={() => sendMessage(s.text)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${topicConfig.color} flex items-center justify-center shrink-0 shadow-sm opacity-80 group-hover:opacity-100 transition-opacity`}>
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                            <p className="text-sm text-muted-foreground group-hover:text-foreground leading-snug transition-colors">
                              {s.text}
                            </p>
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ) : (
                /* ── Chat Messages ── */
                <div className="space-y-6">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-emerald-500/20">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                      )}

                      <div className={`max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? '' : 'min-w-0'}`}>
                        {/* Message bubble */}
                        <div
                          className={`
                            rounded-2xl px-4 py-3
                            ${
                              msg.role === 'user'
                                ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md shadow-emerald-500/20'
                                : 'bg-card border border-border/50 text-card-foreground'
                            }
                          `}
                        >
                          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {msg.content}
                          </div>
                        </div>

                        {/* Sources expandable section */}
                        {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => setExpandedSources(expandedSources === msg.id ? null : msg.id)}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                            >
                              <Sparkles className="w-3 h-3 text-emerald-500" />
                              <span>{msg.blocksFound} источников из базы знаний</span>
                              <ChevronDown
                                className={`w-3 h-3 transition-transform duration-200 ${
                                  expandedSources === msg.id ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                            {expandedSources === msg.id && (
                              <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                {msg.sources.map((src, i) => (
                                  <div
                                    key={i}
                                    className="text-xs bg-secondary/50 rounded-lg p-3 border border-border/30"
                                  >
                                    <div className="flex gap-1.5 mb-1.5 flex-wrap">
                                      <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                        {src.section}
                                      </Badge>
                                      <Badge variant="outline" className="text-[10px] h-5">
                                        {src.topic}
                                      </Badge>
                                    </div>
                                    <p className="text-muted-foreground line-clamp-2 leading-relaxed">{src.preview}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Timestamp */}
                        <div className={`mt-1 text-[10px] text-muted-foreground/50 ${msg.role === 'user' ? 'text-right' : ''}`}>
                          {formatTime(msg.timestamp)}
                        </div>
                      </div>

                      {msg.role === 'user' && (
                        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0 mt-0.5 border border-border/50">
                          <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ── Loading Indicator ── */}
                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-emerald-500/20">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="bg-card border border-border/50 rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5 items-center">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
                          </div>
                          <span className="text-xs text-muted-foreground">Ищу ответ в базе знаний...</span>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                          <Skeleton className="h-2 w-20 bg-emerald-500/10" />
                          <Skeleton className="h-2 w-14 bg-emerald-500/10" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
          </div>
        </div>
      </main>

      {/* ── Input Area ───────────────────────────────────────────────────── */}
      <div className="border-t border-border/50 bg-card/50 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeTopic === 'all'
                    ? 'Спросите про WB, Ozon, карго, SEO, экономику...'
                    : `Спросите про ${TOPICS[activeTopic].label}...`
                }
                className="
                  w-full rounded-xl border border-border/50 bg-secondary/50 px-4 py-3 pr-12
                  text-sm text-foreground placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40
                  resize-none min-h-[48px] max-h-[120px]
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                rows={1}
                disabled={isLoading}
              />
              <div className="absolute right-2 bottom-2 text-[10px] text-muted-foreground/40 hidden sm:block">
                ↵ отправить
              </div>
            </div>
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="h-12 w-12 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/20 shrink-0 transition-all duration-200 disabled:opacity-40 disabled:shadow-none"
              size="icon"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/30 bg-card/30">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            MP Эксперт — AI на базе RAG с BM25+Dense гибридным поиском
          </p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground/40">Порт RAG: 3030</span>
            <Badge variant="outline" className="text-[10px] h-5 bg-emerald-500/5 text-emerald-500/60 border-emerald-500/20">
              <Sparkles className="w-2.5 h-2.5 mr-1" />
              Hybrid Search
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  )
}
