import { useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const conversations = [
  { id: '28674705552157678', name: 'Muhammad Adeel Owaisi', preview: 'What services do you offer?', time: '2m', unread: true, initials: 'MA' },
  { id: 'lead-02', name: 'Sarah Khan', preview: 'I need a five-page website.', time: '18m', unread: true, initials: 'SK' },
  { id: 'lead-03', name: 'Bilal Ahmed', preview: 'Can you share your portfolio?', time: '1h', unread: false, initials: 'BA' },
  { id: 'lead-04', name: 'Ayesha Malik', preview: 'Thanks for the details.', time: '3h', unread: false, initials: 'AM' },
]

const scheduledPosts = [
  { day: 'TODAY', time: '09:00', title: 'WordPress website offer', status: 'Published', tone: 'published' },
  { day: 'TOMORROW', time: '09:00', title: 'Fast landing page package', status: 'Scheduled', tone: 'scheduled' },
  { day: 'FRI 26 SEP', time: '09:00', title: 'Mobile-first business websites', status: 'Scheduled', tone: 'scheduled' },
]

const fallbackReply = 'Thanks for messaging WK Digital Solutions. We build clean, fast, mobile-ready websites and would be happy to discuss your project.'

function App() {
  const [auth, setAuth] = useState({ loading: true, authenticated: false })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [activeView, setActiveView] = useState('inbox')
  const [activeConversation, setActiveConversation] = useState(conversations[0])
  const [draft, setDraft] = useState('')
  const [postDraft, setPostDraft] = useState('')
  const [scheduleAt, setScheduleAt] = useState('')
  const [notice, setNotice] = useState('')
  const [isComposerOpen, setIsComposerOpen] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/api/auth/session`, { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => setAuth({ loading: false, authenticated: data.authenticated }))
      .catch(() => setAuth({ loading: false, authenticated: false }))
  }, [])

  const login = async (event) => {
    event.preventDefault()
    setLoginError('')
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) throw new Error('login failed')
      setAuth({ loading: false, authenticated: true })
    } catch {
      setLoginError('That username or password is not correct.')
    }
  }

  const sendReply = async () => {
    if (!draft.trim()) return
    setNotice('Sending reply...')
    try {
      const response = await fetch(`${API_URL}/api/messages/${activeConversation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: draft.trim() }),
      })
      if (!response.ok) throw new Error('send failed')
      setNotice('Reply sent')
    } catch {
      setNotice('Backend connection required to send live replies')
    }
    setDraft('')
  }

  const createPost = async () => {
    if (!postDraft.trim()) return
    setNotice('Publishing post...')
    try {
      const response = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: postDraft.trim() }),
      })
      if (!response.ok) throw new Error('publish failed')
      setNotice('Post published')
      setPostDraft('')
      setIsComposerOpen(false)
    } catch {
      setNotice('Backend connection required to publish posts')
    }
  }

  const schedulePost = async () => {
    if (!postDraft.trim() || !scheduleAt) return
    setNotice('Scheduling post...')
    try {
      const response = await fetch(`${API_URL}/api/posts/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: postDraft.trim(), publish_at: scheduleAt }),
      })
      if (!response.ok) throw new Error('schedule failed')
      setNotice('Post scheduled')
      setPostDraft('')
      setScheduleAt('')
      setIsComposerOpen(false)
    } catch {
      setNotice('Backend connection required to schedule posts')
    }
  }

  if (auth.loading) return <div className="auth-loading">Checking your session...</div>
  if (!auth.authenticated) {
    return <main className="auth-page"><section className="login-card"><div className="brand-mark">W</div><p className="kicker">WK DIGITAL / PRIVATE CONSOLE</p><h1>Welcome back.</h1><p className="login-copy">Sign in to manage conversations and publish content for WK Digital Solutions.</p><form onSubmit={login}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{loginError && <p className="login-error" role="alert">{loginError}</p>}<button className="primary-button login-button" type="submit">Sign in <span>→</span></button></form><small className="login-footnote">Protected workspace · Facebook Page operations</small></section></main>
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">W</div><div><strong>WK Digital</strong><span>Assistant console</span></div></div>
        <div className="page-chip"><span className="status-dot" /><div><strong>WK Digital Solutions</strong><small>Facebook Page</small></div></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={activeView === 'inbox' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('inbox')} type="button"><span>MSG</span>Inbox <b>2</b></button>
          <button className={activeView === 'schedule' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveView('schedule')} type="button"><span>CAL</span>Content planner</button>
          <button className="nav-item" type="button"><span>SET</span>Settings</button>
        </nav>
        <div className="sidebar-footer"><span className="connection-dot" /><div><strong>Automation online</strong><small>Webhook connected</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="eyebrow">OPERATIONS / {activeView === 'inbox' ? 'MESSENGER INBOX' : 'CONTENT PLANNER'}</div><div className="topbar-actions"><span className="live-label"><i /> Live</span><button className="avatar-button" type="button">WK</button></div></header>
        {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss notification">x</button></div>}

        {activeView === 'inbox' ? (
          <section className="view-grid inbox-view">
            <div className="view-heading"><div><p className="kicker">INBOX</p><h1>Conversations</h1><p className="subhead">Respond to new leads while the context is still warm.</p></div><div className="heading-stat"><strong>12</strong><span>open threads</span></div></div>
            <div className="inbox-layout">
              <section className="panel thread-panel"><div className="panel-toolbar"><div className="search-field"><span>⌕</span><input aria-label="Search conversations" placeholder="Search conversations" /></div><button className="filter-button" type="button">All <span>⌄</span></button></div><div className="thread-list">{conversations.map((conversation) => <button key={conversation.id} className={activeConversation.id === conversation.id ? 'thread active' : 'thread'} onClick={() => setActiveConversation(conversation)} type="button"><span className="initials">{conversation.initials}</span><span className="thread-copy"><strong>{conversation.name}</strong><span>{conversation.preview}</span></span><span className="thread-meta"><small>{conversation.time}</small>{conversation.unread && <i />}</span></button>)}</div></section>
              <section className="panel conversation-panel"><div className="conversation-header"><div className="contact-heading"><span className="initials large">{activeConversation.initials}</span><div><strong>{activeConversation.name}</strong><span>Facebook Messenger</span></div></div><button className="more-button" type="button" aria-label="More conversation actions">...</button></div><div className="message-canvas"><div className="date-rule"><span>Today</span></div><div className="message incoming"><span>{activeConversation.preview}</span><small>Just now</small></div><div className="message outgoing"><span>{fallbackReply}</span><small>AI assistant · delivered</small></div></div><div className="reply-box"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply..." aria-label="Write a reply" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendReply() } }} /><button className="send-button" type="button" onClick={sendReply} aria-label="Send reply">Send</button></div></section>
            </div>
          </section>
        ) : (
          <section className="view-grid schedule-view"><div className="view-heading"><div><p className="kicker">CONTENT PLANNER</p><h1>Stay visible, daily.</h1><p className="subhead">Build a steady rhythm of offers without opening Meta Business Suite.</p></div><button className="primary-button" type="button" onClick={() => setIsComposerOpen(true)}><span>+</span> New post</button></div><div className="schedule-summary"><div><span className="summary-label">NEXT PUBLISH</span><strong>Tomorrow, 09:00</strong><span>Facebook Feed · Public</span></div><div><span className="summary-label">THIS WEEK</span><strong>3 posts</strong><span>2 scheduled · 1 published</span></div><div><span className="summary-label">BEST FORMAT</span><strong>Offer posts</strong><span>32% more replies</span></div></div><div className="planner-layout"><section className="panel calendar-panel"><div className="panel-title"><div><p className="kicker">UPCOMING</p><h2>Publishing queue</h2></div><button className="text-button" type="button">View calendar</button></div><div className="schedule-list">{scheduledPosts.map((post) => <div className="scheduled-row" key={post.title}><div className="schedule-day"><strong>{post.day}</strong><span>{post.time}</span></div><div className="schedule-card"><span className="post-icon">FB</span><div><strong>{post.title}</strong><span>Facebook Feed · WK Digital Solutions</span></div><span className={`post-status ${post.tone}`}>{post.status}</span></div></div>)}</div></section><section className="panel compose-preview"><div className="panel-title"><div><p className="kicker">QUICK COMPOSE</p><h2>Turn attention into leads</h2></div></div><p>Share a clear offer, make the scope easy to understand, and give people one simple next step.</p><div className="preview-card"><span className="preview-label">FACEBOOK PREVIEW</span><strong>WordPress website offer</strong><span>1 website · 5 pages · budget-friendly</span></div><button className="primary-button full" type="button" onClick={() => setIsComposerOpen(true)}>Write a post</button></section></div></section>
        )}
      </main>

      {isComposerOpen && <div className="modal-backdrop" role="presentation"><section className="composer-modal" role="dialog" aria-modal="true" aria-labelledby="composer-title"><div className="modal-header"><div><p className="kicker">FACEBOOK FEED</p><h2 id="composer-title">Create a post</h2></div><button className="close-button" type="button" onClick={() => setIsComposerOpen(false)} aria-label="Close composer">x</button></div><textarea value={postDraft} onChange={(event) => setPostDraft(event.target.value)} placeholder="Write your offer..." aria-label="Post content" /><label className="schedule-input">Schedule for <input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} /></label><div className="composer-footer"><span>Public · WK Digital Solutions</span><div className="composer-actions"><button className="secondary-button" type="button" onClick={schedulePost} disabled={!scheduleAt}>Schedule</button><button className="primary-button" type="button" onClick={createPost}>Publish now</button></div></div></section></div>}
    </div>
  )
}

export default App
