import NavLeft from './NavLeft'
import NavRight from './NavRight'
import ActionTabsBar from './ActionTabsBar'

export default function TopNav() {
  return (
    <nav
      className="fixed top-4 left-4 right-4 z-[100] text-white p-2 flex items-center gap-4 border"
      style={{
        borderRadius: '8px',
        background: '#171717',
        backdropFilter: 'blur(8px)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.1)',
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      <NavLeft />
      <div className="flex-1 flex items-center justify-end">
        <ActionTabsBar />
      </div>
      <NavRight />
    </nav>
  )
}
