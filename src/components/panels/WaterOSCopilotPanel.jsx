import { useState, useEffect, useRef } from 'react'
import React from 'react'
import {
  Maximize2,
  X,
  Sun,
  Zap,
  Activity,
  Brain,
  Map,
  ChartColumn,
  ShieldCheck,
  Send,
  MessageSquare,
  Lightbulb,
  ClipboardList,
  GripVertical,
  BarChart3,
  Clock,
  FileText,
  ArrowRight,
  AlertTriangle,
  ChevronDown,
  Users,
  Check,
  PenLine,
} from 'lucide-react'
import { usePanelContext } from '../../contexts/PanelContext'
import { useDraggable } from '../../hooks/useDraggable'

const questions = [
  { icon: Sun, text: 'Morning Briefing' },
  { icon: Zap, text: 'How does burst detection work without dense sensors?' },
  { icon: Activity, text: 'What are the four burst signature types?' },
  { icon: Brain, text: 'What model architecture powers the risk scoring?' },
  { icon: Map, text: 'How does the coverage confidence map work?' },
  { icon: ChartColumn, text: 'What improves detection when more sensors are added?' },
  { icon: ShieldCheck, text: 'How does gradual pressure decay signal a growing leak?' },
]

// Dynamic action prompts based on context count
const getActionPrompts = (contextCount) => {
  if (contextCount === 1) {
    return [
      { id: 'analyze-impact', label: 'Analyze Impact', icon: BarChart3 },
      { id: 'compare-historical', label: 'Compare with Historical Events', icon: Clock },
      { id: 'generate-report', label: 'Generate Detailed Report', icon: FileText },
      { id: 'next-steps', label: 'Recommend Next Steps', icon: ArrowRight },
    ]
  } else {
    return [
      { id: 'combined-impact', label: 'Analyze Combined Impact', icon: Activity },
      { id: 'compare-events', label: 'Compare Event Patterns', icon: BarChart3 },
      { id: 'multi-report', label: 'Generate Multi-Event Report', icon: FileText },
      { id: 'risk-matrix', label: 'Cross-Event Risk Assessment', icon: ShieldCheck },
      { id: 'timeline', label: 'View Event Timeline', icon: Clock },
      { id: 'cascade-analysis', label: 'Analyze Cascade Effects', icon: Brain },
    ]
  }
}

// Event-specific metrics mapping
const EVENT_METRICS = {
  'water-main-burst-downtown': {
    customersAffected: 2340,
    waterLossRate: '2,400 L/min',
    systemPressure: '22 PSI',
    repairTime: '58 min',
    category: 'Infrastructure',
    description: 'A 12-inch water main rupture was detected at the intersection of Market Street and 4th Street in St. Louis.'
  },
  'pressure-loss': {
    customersAffected: 1250,
    waterLossRate: '850 L/min',
    systemPressure: '15 PSI',
    repairTime: '45 min',
    category: 'Pressure',
    description: 'Low pressure detected in industrial zone affecting multiple pipes.'
  },
  'pump-station': {
    customersAffected: 5420,
    waterLossRate: '3,200 L/min',
    systemPressure: '10 PSI',
    repairTime: '120 min',
    category: 'Equipment',
    description: 'Pump station outage in north district causing widespread pressure drop.'
  },
  'valve-failure': {
    customersAffected: 6890,
    waterLossRate: '4,100 L/min',
    systemPressure: '8 PSI',
    repairTime: '90 min',
    category: 'Infrastructure',
    description: 'Critical valve failure in downtown area requiring immediate attention.'
  },
  'main-break': {
    customersAffected: 3200,
    waterLossRate: '1,800 L/min',
    systemPressure: '18 PSI',
    repairTime: '75 min',
    category: 'Infrastructure',
    description: 'Main break on Oak Street causing service disruption.'
  }
}

// Optimized metrics (projected improvements after recommended action)
const OPTIMIZED_METRICS = {
  'water-main-burst-downtown': {
    customersAffected: 580,
    waterLossRate: '450 L/min',
    systemPressure: '58 PSI',
    repairTime: '22 min',
  },
  'pressure-loss': {
    customersAffected: 280,
    waterLossRate: '180 L/min',
    systemPressure: '48 PSI',
    repairTime: '18 min',
  },
  'pump-station': {
    customersAffected: 1200,
    waterLossRate: '680 L/min',
    systemPressure: '42 PSI',
    repairTime: '35 min',
  },
  'valve-failure': {
    customersAffected: 1450,
    waterLossRate: '820 L/min',
    systemPressure: '38 PSI',
    repairTime: '28 min',
  },
  'main-break': {
    customersAffected: 720,
    waterLossRate: '380 L/min',
    systemPressure: '52 PSI',
    repairTime: '25 min',
  }
}

export default function WaterOSCopilotPanel() {
  const { 
    activeTab, 
    setActiveTab, 
    chatMessages, 
    setChatMessages,
    deleteMessage, 
    copilotVisible,
    setCopilotVisible,
    addSuccessNotification,
    createWorkOrder,
    sendUserMessage,
    isAiResponding,
    aiError,
  } = usePanelContext()
  const intelligenceItems = []
  const hasUnreadIntelligence = false
  const clearIntelligenceNotification = () => {}
  const { position, isDragging, dragRef, handleMouseDown } = useDraggable({ x: 645, y: 104 })
  const chatEndRef = useRef(null)
  const [expandedCardId, setExpandedCardId] = useState(null)
  const [viewOptimizedStates, setViewOptimizedStates] = useState({})
  const [implementationStates, setImplementationStates] = useState({}) // Track implementation progress per item
  const [implementationSteps, setImplementationSteps] = useState({}) // Track which steps are complete per item
  const [meterImplementationStates, setMeterImplementationStates] = useState({}) // Track meter action implementation
  const [meterImplementationSteps, setMeterImplementationSteps] = useState({}) // Track meter implementation steps
  
  // Input state for chat
  const [inputText, setInputText] = useState('')
  const [customPlanStepInputs, setCustomPlanStepInputs] = useState({})
  
  // Count event context messages
  const eventContextMessages = chatMessages.filter(msg => msg.type === 'event-context')
  const contextCount = eventContextMessages.length
  
  // Get dynamic action prompts based on context count
  const actionPrompts = getActionPrompts(contextCount)
  
  // Handle card click for expansion
  const handleCardClick = (messageId) => {
    setExpandedCardId(prev => prev === messageId ? null : messageId)
  }
  
  // Handle implementation approval - simulates AI executing steps
  const handleImplementation = async (itemId) => {
    // Set initial state
    setImplementationStates(prev => ({ ...prev, [itemId]: 'in-progress' }))
    setImplementationSteps(prev => ({ ...prev, [itemId]: [] }))
    
    const steps = [
      { id: 'crew', label: 'Searching for available crew members', delay: 1500 },
      { id: 'equipment', label: 'Checking equipment availability', delay: 1200 },
      { id: 'closure', label: 'Submitting lane/road closure request', delay: 1800 },
      { id: 'permit', label: 'Processing work permits', delay: 1500 },
      { id: 'dispatch', label: 'Dispatching field crew', delay: 1000 },
    ]
    
    // Execute steps sequentially
    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, step.delay))
      setImplementationSteps(prev => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), step]
      }))
      
      // Trigger success notification for each step
      addSuccessNotification(step.label)
    }
    
    // Mark as complete
    await new Promise(resolve => setTimeout(resolve, 800))
    setImplementationStates(prev => ({ ...prev, [itemId]: 'complete' }))
    // Final success notification
    addSuccessNotification('Recommended action implemented successfully')
  }

  // Handle meter action implementation
  const handleMeterImplementation = async (messageId, meterId, status) => {
    // Set initial state
    setMeterImplementationStates(prev => ({ ...prev, [messageId]: 'in-progress' }))
    setMeterImplementationSteps(prev => ({ ...prev, [messageId]: [] }))
    
    const steps = status === 'critical' 
      ? [
          { id: 'crew', label: `Dispatching field crew to Meter ${meterId}`, delay: 1500 },
          { id: 'zone', label: 'Preparing zone isolation protocols', delay: 1200 },
          { id: 'monitoring', label: 'Activating downstream meter monitoring', delay: 1800 },
          { id: 'calibration', label: 'Scheduling calibration check', delay: 1000 },
          { id: 'notification', label: 'Notifying operations team', delay: 800 },
        ]
      : [
          { id: 'frequency', label: `Increasing monitoring frequency for Meter ${meterId}`, delay: 1200 },
          { id: 'analysis', label: 'Running historical pressure variance analysis', delay: 1800 },
          { id: 'inspection', label: 'Scheduling preventive inspection', delay: 1500 },
          { id: 'crew', label: 'Alerting field crews for potential escalation', delay: 1000 },
          { id: 'workorder', label: 'Creating monitoring work order', delay: 800 },
        ]
    
    // Execute steps sequentially
    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, step.delay))
      setMeterImplementationSteps(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), step]
      }))
      
      // Trigger success notification for each step
      addSuccessNotification(step.label)
    }
    
    // Mark as complete
    await new Promise(resolve => setTimeout(resolve, 800))
    setMeterImplementationStates(prev => ({ ...prev, [messageId]: 'complete' }))
    
    // Final success notification
    addSuccessNotification(`Meter ${meterId} action plan successfully implemented`)
  }
  
  // Handle action prompt clicks
  const handleActionClick = (actionId, contextMessage = null) => {
    if (actionId === 'analyze-impact' || actionId === 'combined-impact') {
      // Check if this is a meter context
      if (contextMessage && contextMessage.context.source === 'Network Meter Details') {
        // For meter contexts, show the recommendations inline
        setChatMessages(prev => prev.map(msg => 
          msg.id === contextMessage.id 
            ? { ...msg, showRecommendations: true }
            : msg
        ))
        return
      }
      
      // For event contexts, continue with existing logic
      // Get the relevant context(s) with eventId
      const contexts = eventContextMessages.map(msg => ({
        ...msg.context,
        eventId: msg.eventId || Object.keys(EVENT_METRICS).find(key => 
          EVENT_METRICS[key].description === msg.context.eventName ||
          msg.context.eventName?.includes(EVENT_METRICS[key].category)
        ) || 'water-main-burst-downtown'
      }))
      
      // Get the primary event ID from the first context
      const primaryEventId = contexts[0]?.eventId || 'water-main-burst-downtown'
      const eventMetrics = EVENT_METRICS[primaryEventId]
      
      // Add impact analysis inline to chat (same window)
      const impactAnalysisMessage = {
        id: Date.now(),
        type: 'impact-analysis',
        timestamp: new Date(),
        eventName: contexts.length === 1 ? contexts[0].eventName : `${contexts.length} Events`,
        eventId: primaryEventId,
        category: eventMetrics?.category || 'Infrastructure',
        description: eventMetrics?.description || contexts[0].eventName,
        contexts: contexts,
      }
      setChatMessages((prev) => [...prev, impactAnalysisMessage])
    }
  }

  const updateActionPlanMessage = (messageId, updates) => {
    setChatMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
    )
  }

  const handleRemovePlanStep = (messageId, stepId) => {
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg
        const current = msg.removedStepIds || []
        if (current.includes(stepId)) return msg
        return { ...msg, removedStepIds: [...current, stepId] }
      })
    )
  }

  const handleAddCustomPlanStep = (messageId) => {
    const input = (customPlanStepInputs[messageId] || '').trim()
    if (!input) return
    setChatMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg
        const customSteps = msg.customSteps || []
        return {
          ...msg,
          customSteps: [
            ...customSteps,
            { id: `custom-${Date.now()}`, text: input, source: 'custom' },
          ],
        }
      })
    )
    setCustomPlanStepInputs((prev) => ({ ...prev, [messageId]: '' }))
  }

  const handleApprovePlan = (message) => {
    if (message.approvedAction) return

    const baseSteps = message.context?.steps || []
    const removedIds = message.removedStepIds || []
    const customSteps = message.customSteps || []
    const approvedSteps = [...baseSteps.filter((s) => !removedIds.includes(s.id)), ...customSteps]

    if (message.context?.workOrderStrategy === 'single') {
      createWorkOrder({
        type: message.context?.title || 'AI Recommended Action',
        priority: 'High',
        status: 'New',
        location: message.context?.locationHint || 'City Priority Zone',
        instructions: message.context?.description || 'Execute approved action plan steps.',
        actionItems: approvedSteps.map((step) => step.text),
        updatedAt: new Date().toISOString(),
      })
      addSuccessNotification('Work order created with plan checklist')
    } else {
      approvedSteps.forEach((step, idx) => {
        createWorkOrder({
          type: message.context?.title || 'AI Recommended Action',
          priority: 'High',
          status: 'New',
          location: message.context?.locationHint || 'City Priority Zone',
          instructions: step.text,
          actionItems: [step.text],
          updatedAt: new Date().toISOString(),
        })
        addSuccessNotification(`Work order created: Step ${idx + 1}`)
      })
    }

    updateActionPlanMessage(message.id, { approvedAction: true })
    addSuccessNotification('AI action plan approved and work orders created')
  }
  
  // Handle sending user chat messages
  const handleSendMessage = async () => {
    if (!inputText.trim() || isAiResponding) return
    
    await sendUserMessage(inputText)
    setInputText('')
  }
  
  // Handle Enter key to send message
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (activeTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, activeTab])

  if (!copilotVisible) return null

  return (
    <div
      className="rounded-xl border fixed shadow-xl overflow-hidden flex flex-col z-40"
      role="region"
      aria-label="Sand Intelligence Assistant"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: '438px',
        height: '704px',
        maxHeight: 'calc(100vh - 5rem)',
        backgroundColor: 'var(--sand-surface)',
        color: 'var(--color-gray-100)',
        borderColor: 'var(--color-gray-700)',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Title bar with drag handle */}
      <div
        ref={dragRef}
        className="p-3 flex items-center justify-between select-none shrink-0"
        style={{ 
          borderBottom: '1px solid var(--color-gray-700)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-4 h-4 shrink-0" style={{ color: 'var(--color-gray-400)' }} aria-hidden="true" />
          <span className="shrink-0 flex items-center">
            {/* Copilot logo placeholder */}
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ backgroundColor: 'var(--sand-teal)' }}
            >
              <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-white)' }} />
            </div>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--color-gray-100)' }}>
                Sand Intelligence Assistant
              </h2>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="inline-flex items-center justify-center rounded-md h-7 w-7 transition-colors"
            style={{ color: 'var(--color-gray-300)' }}
            title="Expand fullscreen"
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-gray-700)'; e.currentTarget.style.color = 'var(--color-gray-100)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-gray-300)' }}
          >
            <Maximize2 className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            className="inline-flex items-center justify-center rounded-md h-7 w-7 transition-colors"
            style={{ color: 'var(--color-gray-300)' }}
            title="Close"
            onClick={() => setCopilotVisible(false)}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-gray-700)'; e.currentTarget.style.color = 'var(--color-gray-100)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--color-gray-300)' }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize z-10 flex items-center justify-center opacity-40 hover:opacity-100"
        title="Drag to resize"
      >
        <svg className="w-3 h-3" style={{ color: 'var(--color-gray-400)' }} viewBox="0 0 10 10" fill="currentColor">
          <path d="M9 1v8H1" stroke="currentColor" strokeWidth="1.5" fill="none"></path>
          <path d="M9 4v5H4" stroke="currentColor" strokeWidth="1.5" fill="none"></path>
        </svg>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--color-gray-700)' }}>
        <button
          onClick={() => setActiveTab('chat')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors"
          style={{
            fontSize: 'var(--text-xs)',
            color: activeTab === 'chat' ? 'var(--sand-teal)' : 'var(--color-gray-400)',
            borderBottom: activeTab === 'chat' ? '2px solid var(--sand-teal)' : '2px solid transparent',
          }}
        >
          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
          Chat
        </button>
        <button
          type="button"
          disabled
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors relative"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gray-500)',
            borderBottom: '2px solid transparent',
            opacity: 0.55,
            cursor: 'not-allowed',
          }}
        >
          <Lightbulb className="w-3.5 h-3.5" aria-hidden="true" />
          Intelligence
          {hasUnreadIntelligence && (
            <span
              className="absolute top-1 right-2 w-2 h-2 rounded-full"
              style={{ backgroundColor: '#eab308' }}
            />
          )}
        </button>
        <button
          type="button"
          disabled
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 font-medium transition-colors"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gray-500)',
            borderBottom: '2px solid transparent',
            opacity: 0.55,
            cursor: 'not-allowed',
          }}
        >
          <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
          Briefing
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1" style={{ minHeight: 0 }}>
        {activeTab === 'chat' ? (
          /* Chat Tab */
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
              {chatMessages.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquare className="w-12 h-12 mb-3" style={{ color: 'var(--color-gray-600)' }} />
                  <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-300)' }}>
                    No conversations yet
                  </p>
                  <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>
                    Send event context from the Event Affected Area panel to start
                  </p>
                </div>
              ) : contextCount <= 1 ? (
                /* Single context - vertical full card */
                chatMessages.map((message) => (
                    <div key={message.id}>
                      {message.type === 'user-message' ? (
                        /* User message - right aligned */
                        <div className="flex items-start gap-2 mb-3 justify-end">
                          <div 
                            className="rounded-lg px-3 py-2 max-w-[80%]"
                            style={{ 
                              backgroundColor: 'var(--sand-teal)',
                              color: 'var(--color-white)',
                            }}
                          >
                            <p style={{ fontSize: 'var(--text-sm)', lineHeight: '1.5' }}>
                              {message.message}
                            </p>
                          </div>
                        </div>
                      ) : message.type === 'ai-message' ? (
                        /* AI response message */
                        <div className="flex items-start gap-2 mb-3">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: 'var(--sand-teal)' }}
                          >
                            <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-white)' }} />
                          </div>
                          <div
                            className="flex-1 rounded-lg px-3 py-2"
                            style={{
                              backgroundColor: 'var(--color-gray-700)',
                            }}
                          >
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-200)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                              {message.message}
                            </p>
                          </div>
                        </div>
                      ) : message.type === 'agent-response' ? (
                        /* Agent response message */
                        <div className="flex items-start gap-2 mb-3">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: 'var(--sand-teal)' }}
                          >
                            <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-white)' }} />
                          </div>
                          <div
                            className="flex-1 rounded-lg px-3 py-2"
                            style={{
                              backgroundColor: 'rgba(46, 185, 194, 0.1)',
                              borderLeft: '2px solid var(--sand-teal)',
                            }}
                          >
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-200)', lineHeight: '1.5' }}>
                              {message.message}
                            </p>
                          </div>
                        </div>
                      ) : message.type === 'impact-analysis' ? (
                        /* Inline Impact Analysis card + follow-up flow */
                        (() => {
                          const item = message
                          const eventMetrics = EVENT_METRICS[item.eventId] || EVENT_METRICS['water-main-burst-downtown']
                          return (
                            <>
                            <div
                              className="rounded-lg border overflow-hidden mb-3"
                              style={{
                                backgroundColor: 'var(--color-gray-700)',
                                borderColor: 'var(--color-gray-600)',
                              }}
                            >
                              <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-gray-600)' }}>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="px-2 py-0.5 rounded shrink-0"
                                      style={{
                                        fontSize: 'var(--text-xs)',
                                        fontWeight: 'var(--font-weight-semibold)',
                                        backgroundColor: 'var(--color-red-500)',
                                        color: 'var(--color-white)',
                                      }}
                                    >
                                      Critical
                                    </span>
                                    <span className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>
                                      {item.category || eventMetrics.category}
                                    </span>
                                  </div>
                                </div>
                                <h2 className="text-sm font-semibold leading-tight truncate mb-1" style={{ color: 'var(--color-gray-100)' }}>
                                  {item.eventName}
                                </h2>
                                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)', lineHeight: 1.4 }}>
                                  {item.description || eventMetrics.description}
                                </p>
                              </div>
                              <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-gray-600)' }}>
                                <label className="block mb-1.5" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                                  Burst Location
                                </label>
                                <div
                                  className="rounded-lg flex items-center justify-center"
                                  style={{ height: '80px', border: '1px solid var(--color-gray-600)', backgroundColor: 'var(--color-gray-800)' }}
                                >
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)' }}>Location data unavailable</span>
                                </div>
                              </div>
                              <div className="px-3 py-2 pt-2.5" style={{ borderBottom: '1px solid var(--color-gray-600)' }}>
                                <div className="flex items-center gap-1.5 font-semibold mb-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                                  Impact Metrics
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>Customers Affected</p>
                                    <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>{eventMetrics.customersAffected?.toLocaleString()}</p>
                                  </div>
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>Water Loss Rate</p>
                                    <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>{eventMetrics.waterLossRate}</p>
                                  </div>
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>System Pressure</p>
                                    <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>{eventMetrics.systemPressure}</p>
                                  </div>
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>Estimated Repair Time</p>
                                    <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>{eventMetrics.repairTime}</p>
                                  </div>
                                </div>
                              </div>
                              {item.contexts?.[0]?.recommendation && (
                                <div className="px-3 py-2 pt-2.5">
                                  <div className="flex items-center gap-1.5 font-semibold mb-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                                    Recommended Action
                                  </div>
                                  <div className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                                    {item.contexts[0].recommendation.title}
                                  </div>
                                  <p className="mt-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>
                                    {item.contexts[0].recommendation.description}
                                  </p>
                                </div>
                              )}
                            </div>
                            {/* Follow-up: Would you like to see optimized metrics? */}
                            {item.contexts?.[0]?.recommendation && !viewOptimizedStates[item.id] && (
                              <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                                <div className="inline-ai-avatar">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </div>
                                <div className="inline-ai-message-content">
                                  <p>Would you like to see the optimized metrics after implementing the recommended action?</p>
                                  <div className="inline-ai-actions">
                                    <button
                                      onClick={() => setViewOptimizedStates(prev => ({ ...prev, [item.id]: true }))}
                                      className="inline-ai-btn inline-ai-btn-approve"
                                    >
                                      Yes, Show Optimized
                                    </button>
                                    <button className="inline-ai-btn inline-ai-btn-modify">
                                      Not Now
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {/* Follow-up: Optimized metrics + approval */}
                            {item.contexts?.[0]?.recommendation && viewOptimizedStates[item.id] && (
                              <>
                                <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                                  <div className="inline-ai-avatar">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="inline-ai-message-content">
                                    <p>Here's how the metrics would improve with the recommended action implemented:</p>
                                  </div>
                                </div>
                                <div
                                  className="rounded-lg border overflow-hidden mt-3"
                                  style={{
                                    backgroundColor: 'var(--color-gray-700)',
                                    borderColor: 'var(--color-gray-600)',
                                  }}
                                >
                                  <div className="px-3 py-2 pt-2.5">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-1.5 font-semibold" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                                        <ChartColumn className="w-3.5 h-3.5" aria-hidden="true" />
                                        Optimized Impact Metrics
                                      </div>
                                      <button
                                        onClick={() => setViewOptimizedStates(prev => ({ ...prev, [item.id]: false }))}
                                        className="px-2 py-1 rounded transition-colors"
                                        style={{
                                          fontSize: 'var(--text-xs)',
                                          fontWeight: 'var(--font-weight-medium)',
                                          color: 'var(--color-gray-400)',
                                          backgroundColor: 'var(--color-gray-600)',
                                          border: '1px solid var(--color-gray-500)',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = 'var(--color-gray-500)'
                                          e.currentTarget.style.color = 'var(--color-gray-100)'
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = 'var(--color-gray-600)'
                                          e.currentTarget.style.color = 'var(--color-gray-400)'
                                        }}
                                      >
                                        View Current
                                      </button>
                                    </div>
                                    {(() => {
                                      const optimizedMetrics = OPTIMIZED_METRICS[item.eventId] || eventMetrics
                                      return (
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>Customers Affected</p>
                                            <div className="flex items-baseline gap-1.5">
                                              <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>{optimizedMetrics.customersAffected?.toLocaleString()}</span>
                                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>↓{Math.round((1 - optimizedMetrics.customersAffected / eventMetrics.customersAffected) * 100)}%</span>
                                            </div>
                                          </div>
                                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>Water Loss Rate</p>
                                            <div className="flex items-baseline gap-1.5">
                                              <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>{optimizedMetrics.waterLossRate}</span>
                                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>↓81%</span>
                                            </div>
                                          </div>
                                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>System Pressure</p>
                                            <div className="flex items-baseline gap-1.5">
                                              <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>{optimizedMetrics.systemPressure}</span>
                                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>↑164%</span>
                                            </div>
                                          </div>
                                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>Estimated Repair Time</p>
                                            <div className="flex items-baseline gap-1.5">
                                              <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>{optimizedMetrics.repairTime}</span>
                                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>↓62%</span>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </div>
                                {!implementationStates[item.id] && (
                                  <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                                    <div className="inline-ai-avatar">
                                      <MessageSquare className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="inline-ai-message-content">
                                      <p>Would you like to proceed with implementing this recommended action?</p>
                                      <div className="inline-ai-actions">
                                        <button
                                          onClick={() => handleImplementation(item.id)}
                                          className="inline-ai-btn inline-ai-btn-approve"
                                        >
                                          Approve/Implement
                                        </button>
                                        <button className="inline-ai-btn inline-ai-btn-modify">
                                          Not Now
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {implementationStates[item.id] && (
                                  <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                                    <div className="inline-ai-avatar">
                                      <MessageSquare className="w-3.5 h-3.5" />
                                    </div>
                                    <div className="inline-ai-message-content">
                                      {implementationStates[item.id] === 'in-progress' && (
                                        <>
                                          <p style={{ marginBottom: '8px' }}>Implementing recommended action...</p>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', color: 'var(--color-gray-300)' }}>
                                            {implementationSteps[item.id]?.map((step, idx) => (
                                              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ color: 'var(--color-green-400)', fontSize: '12px' }}>✓</span>
                                                <span>{step.label}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      {implementationStates[item.id] === 'complete' && (
                                        <div>
                                          <p style={{ marginBottom: '8px', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>
                                            ✓ Implementation Successful
                                          </p>
                                          <p style={{ fontSize: '11px', color: 'var(--color-gray-300)', lineHeight: '1.5' }}>
                                            The recommended action has been successfully implemented. Field crew has been dispatched. Work permits and road closures are in place.
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                            </>
                          )
                        })()
                      ) : message.type === 'action-plan-context' ? (
                        <div
                          className="rounded-lg border p-3 mb-3"
                          style={{
                            backgroundColor: 'var(--color-gray-700)',
                            borderColor: message.approvedAction ? 'rgba(34,197,94,0.45)' : 'rgba(96,165,250,0.35)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#93c5fd' }}>
                                AI Enhanced Recommended Action
                              </p>
                              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--color-gray-100)' }}>
                                {message.context?.title}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteMessage(message.id)}
                              className="inline-flex items-center justify-center rounded-md h-6 w-6 transition-colors shrink-0"
                              style={{ color: 'var(--color-gray-400)' }}
                              title="Remove context"
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <p className="text-xs mb-3" style={{ color: 'var(--color-gray-300)', lineHeight: 1.5 }}>
                            {message.context?.description}
                          </p>
                          <div className="space-y-1.5 mb-2">
                            {[...(message.context?.steps || []), ...(message.customSteps || [])]
                              .filter((step) => !(message.removedStepIds || []).includes(step.id))
                              .map((step, idx) => (
                                <div
                                  key={step.id}
                                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                                  style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                                >
                                  <span className="text-xs" style={{ color: 'var(--color-gray-200)' }}>
                                    {idx + 1}. {step.text}
                                  </span>
                                  {!message.approvedAction && (
                                    <button
                                      onClick={() => handleRemovePlanStep(message.id, step.id)}
                                      className="text-[10px] px-2 py-0.5 rounded border"
                                      style={{ borderColor: 'var(--color-gray-500)', color: 'var(--color-gray-400)' }}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              ))}
                          </div>
                          {!message.approvedAction && (
                            <div className="flex items-center gap-2 mb-3">
                              <input
                                type="text"
                                value={customPlanStepInputs[message.id] || ''}
                                onChange={(e) =>
                                  setCustomPlanStepInputs((prev) => ({ ...prev, [message.id]: e.target.value }))
                                }
                                placeholder="Add custom step..."
                                className="flex-1 rounded px-2 py-1.5 text-xs border"
                                style={{
                                  backgroundColor: 'var(--color-gray-800)',
                                  borderColor: 'var(--color-gray-600)',
                                  color: 'var(--color-gray-100)',
                                }}
                              />
                              <button
                                onClick={() => handleAddCustomPlanStep(message.id)}
                                className="px-2 py-1.5 rounded text-xs font-semibold border"
                                style={{ borderColor: 'var(--color-gray-500)', color: 'var(--color-gray-200)' }}
                              >
                                Add
                              </button>
                            </div>
                          )}
                          <div className="inline-ai-message ai" style={{ marginTop: 0 }}>
                            <div className="inline-ai-avatar">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </div>
                            <div className="inline-ai-message-content">
                              {message.approvedAction ? (
                                <p>Plan approved. Work orders were created from the selected steps.</p>
                              ) : (
                                <>
                                  <p>Approve this plan to create work orders from the selected steps.</p>
                                  <div className="inline-ai-actions">
                                    <button
                                      onClick={() => handleApprovePlan(message)}
                                      className="inline-ai-btn inline-ai-btn-approve"
                                    >
                                      Approve Plan
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : message.type === 'event-context' ? (
                      <div className="space-y-3">
                        {/* Event context card */}
                        <div
                          className="rounded-lg border p-3"
                          style={{
                            backgroundColor: 'var(--color-gray-700)',
                            borderColor: message.context.source === 'Network Meter Details' 
                              ? (message.context.status === 'critical' ? 'var(--color-red-500)' : 
                                 message.context.status === 'warning' ? 'var(--color-orange-500)' : 
                                 'var(--color-gray-600)')
                              : 'var(--color-gray-600)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center"
                                style={{ 
                                  backgroundColor: message.context.source === 'Network Meter Details'
                                    ? (message.context.status === 'critical' ? 'var(--color-red-500)' : 
                                       message.context.status === 'warning' ? 'var(--color-orange-500)' : 
                                       'var(--sand-teal)')
                                    : 'var(--sand-teal)'
                                }}
                              >
                                <MessageSquare className="w-3.5 h-3.5" style={{ color: 'var(--color-white)' }} />
                              </div>
                              <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                                {message.context.source === 'Network Meter Details' 
                                  ? `Meter ${message.context.meterId}` 
                                  : message.context.eventName}
                              </span>
                            </div>
                            <button
                              onClick={() => deleteMessage(message.id)}
                              className="inline-flex items-center justify-center rounded-md h-6 w-6 transition-colors shrink-0"
                              style={{ color: 'var(--color-gray-400)' }}
                              title="Remove context"
                              onMouseEnter={(e) => { 
                                e.currentTarget.style.backgroundColor = 'var(--color-red-600)'
                                e.currentTarget.style.color = 'var(--color-white)' 
                              }}
                              onMouseLeave={(e) => { 
                                e.currentTarget.style.backgroundColor = 'transparent'
                                e.currentTarget.style.color = 'var(--color-gray-400)' 
                              }}
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="space-y-1.5 ml-8">
                            {/* Meter-specific status alert */}
                            {message.context.source === 'Network Meter Details' && (
                              <div className="mb-2 -ml-8 p-2 rounded" style={{ 
                                backgroundColor: message.context.status === 'critical' ? 'rgba(220, 38, 38, 0.2)' : 
                                                 message.context.status === 'warning' ? 'rgba(251, 146, 60, 0.2)' : 
                                                 'rgba(59, 130, 246, 0.2)',
                                borderLeft: `3px solid ${message.context.status === 'critical' ? 'var(--color-red-500)' : 
                                                         message.context.status === 'warning' ? 'var(--color-orange-500)' : 
                                                         'var(--color-blue-500)'}`
                              }}>
                                <div className="font-semibold mb-1" style={{ 
                                  fontSize: 'var(--text-xs)', 
                                  color: message.context.status === 'critical' ? 'var(--color-red-400)' : 
                                         message.context.status === 'warning' ? 'var(--color-orange-400)' : 
                                         'var(--color-blue-400)'
                                }}>
                                  {message.context.statusLabel}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-300)', lineHeight: '1.4' }}>
                                  {message.context.description}
                                </div>
                              </div>
                            )}
                            {message.context.source !== 'Network Meter Details' && (
                            <>
                            <div className="flex justify-between">
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Event:</span>
                              <span className="font-medium text-right" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                {message.context.eventName}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Date:</span>
                              <span className="font-medium text-right" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                {message.context.dateTimeRange}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Affected Pipes:</span>
                              <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                {message.context.affectedPipes} ({message.context.threshold})
                              </span>
                            </div>
                            </>
                            )}
                            {/* Common fields that might exist in both */}
                            {message.context.customersAffected && (
                            <div className="flex justify-between">
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Customers:</span>
                              <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                {message.context.customersAffected?.toLocaleString() || 'N/A'}
                              </span>
                            </div>
                            )}
                            {message.context.severity && (
                            <div className="flex justify-between items-start">
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Severity:</span>
                              <div className="flex gap-1 flex-wrap justify-end">
                                {message.context.severity.map((sev, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded"
                                    style={{
                                      fontSize: '10px',
                                      backgroundColor: sev.color === 'red' ? 'var(--color-red-600)' : 'var(--color-orange-600)',
                                      color: 'var(--color-white)',
                                    }}
                                  >
                                    {sev.count} {sev.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                            )}
                            {/* Meter-specific fields */}
                            {message.context.source === 'Network Meter Details' && (
                              <>
                                <div className="flex justify-between">
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Pressure:</span>
                                  <span className="font-medium" style={{ 
                                    fontSize: 'var(--text-xs)', 
                                    color: message.context.status === 'critical' ? 'var(--color-red-400)' : 
                                           message.context.status === 'warning' ? 'var(--color-orange-400)' : 
                                           'var(--color-gray-200)',
                                    fontWeight: 'var(--font-weight-semibold)'
                                  }}>
                                    {message.context.pressureDisplay}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Flow Rate:</span>
                                  <span className="font-medium" style={{ 
                                    fontSize: 'var(--text-xs)', 
                                    color: message.context.status === 'critical' ? 'var(--color-red-400)' : 
                                           'var(--color-gray-200)'
                                  }}>
                                    {message.context.flow} L/min
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Water Quality:</span>
                                  <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                    {message.context.quality}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Impact Level:</span>
                                  <span 
                                    className="px-2 py-0.5 rounded font-semibold"
                                    style={{ 
                                      fontSize: '10px',
                                      backgroundColor: message.context.impact === 'High' ? 'var(--color-red-600)' : 
                                                       message.context.impact === 'Medium' ? 'var(--color-orange-600)' : 
                                                       'var(--color-blue-600)',
                                      color: 'var(--color-white)'
                                    }}
                                  >
                                    {message.context.impact}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Last Reading:</span>
                                  <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                    {message.context.lastReading}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        
                        {/* Action prompts - only show after the LAST context message */}
                        {message.id === eventContextMessages[eventContextMessages.length - 1]?.id && (
                          <div className="space-y-2">
                            <p className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                              What would you like to do?
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {actionPrompts.map(({ id, label, icon: Icon }) => (
                                <button
                                  key={id}
                                  disabled={id !== 'analyze-impact'}
                                  onClick={() => handleActionClick(id, message)}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${id !== 'analyze-impact' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  style={{
                                    fontSize: 'var(--text-xs)',
                                    backgroundColor: 'rgba(55, 65, 81, 0.6)',
                                    borderColor: 'var(--color-gray-600)',
                                    color: 'var(--color-gray-300)',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (e.currentTarget.disabled) return
                                    e.currentTarget.style.backgroundColor = 'var(--sand-teal)'
                                    e.currentTarget.style.borderColor = 'var(--sand-teal)'
                                    e.currentTarget.style.color = 'var(--color-white)'
                                  }}
                                  onMouseLeave={(e) => {
                                    if (e.currentTarget.disabled) return
                                    e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.6)'
                                    e.currentTarget.style.borderColor = 'var(--color-gray-600)'
                                    e.currentTarget.style.color = 'var(--color-gray-300)'
                                  }}
                                >
                                  <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                  <span className="leading-tight">{label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Meter Recommended Actions - for warning/critical only */}
                        {message.context.source === 'Network Meter Details' && 
                         (message.context.status === 'warning' || message.context.status === 'critical') && 
                         message.showRecommendations && (
                          <div className="mt-3 space-y-3">
                            {/* Recommended Actions Card */}
                            <>
                              <div
                                className="rounded-lg border overflow-hidden"
                                style={{
                                  backgroundColor: 'var(--color-gray-700)',
                                  borderColor: 'var(--color-gray-600)',
                                }}
                              >
                                <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-gray-600)' }}>
                                  <div className="flex items-center gap-1.5 font-semibold mb-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                                    Recommended Actions
                                  </div>
                                  <div className="space-y-2 mt-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)', lineHeight: '1.5' }}>
                                    {message.context.status === 'critical' ? (
                                      <>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>1.</span>
                                          <span>Dispatch a field crew to inspect the pipeline segment for signs of burst or leak</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>2.</span>
                                          <span>Isolate the affected zone if pressure continues to drop</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>3.</span>
                                          <span>Monitor flow and pressure at downstream meters for cascade effects</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>4.</span>
                                          <span>Schedule immediate calibration check after incident resolution</span>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>1.</span>
                                          <span>Increase monitoring frequency for this meter over the next 24–48 hours</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>2.</span>
                                          <span>Compare current pressure variance with historical patterns</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>3.</span>
                                          <span>Schedule preventive inspection if elevated variance persists</span>
                                        </div>
                                        <div className="flex gap-2">
                                          <span style={{ color: 'var(--sand-teal)', fontWeight: 'var(--font-weight-semibold)' }}>4.</span>
                                          <span>Ensure field crews are aware for potential escalation</span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Projected Impact */}
                                {!message.approvedAction && (
                                  <div className="px-3 py-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <div className="flex items-center gap-1.5 font-semibold mb-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                                      <ChartColumn className="w-3.5 h-3.5" aria-hidden="true" />
                                      Projected Impact
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="p-2 rounded" style={{ backgroundColor: 'rgba(46, 185, 194, 0.1)', border: '1px solid rgba(46, 185, 194, 0.3)' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--color-gray-400)', marginBottom: '4px' }}>Risk Reduction</div>
                                        <div className="flex items-baseline gap-1">
                                          <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-green-400)' }}>
                                            {message.context.status === 'critical' ? '85%' : '65%'}
                                          </span>
                                          <span style={{ fontSize: '10px', color: 'var(--color-green-400)' }}>↓</span>
                                        </div>
                                      </div>
                                      <div className="p-2 rounded" style={{ backgroundColor: 'rgba(46, 185, 194, 0.1)', border: '1px solid rgba(46, 185, 194, 0.3)' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--color-gray-400)', marginBottom: '4px' }}>Response Time</div>
                                        <div className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-green-400)' }}>
                                          {message.context.status === 'critical' ? '15 min' : '2-4 hrs'}
                                        </div>
                                      </div>
                                      <div className="p-2 rounded" style={{ backgroundColor: 'rgba(46, 185, 194, 0.1)', border: '1px solid rgba(46, 185, 194, 0.3)' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--color-gray-400)', marginBottom: '4px' }}>Estimated Cost</div>
                                        <div className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-200)' }}>
                                          {message.context.status === 'critical' ? '$2,400' : '$850'}
                                        </div>
                                      </div>
                                      <div className="p-2 rounded" style={{ backgroundColor: 'rgba(46, 185, 194, 0.1)', border: '1px solid rgba(46, 185, 194, 0.3)' }}>
                                        <div style={{ fontSize: '10px', color: 'var(--color-gray-400)', marginBottom: '4px' }}>Prevented Loss</div>
                                        <div className="flex items-baseline gap-1">
                                          <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-green-400)' }}>
                                            {message.context.status === 'critical' ? '$18K' : '$5K'}
                                          </span>
                                          <span style={{ fontSize: '10px', color: 'var(--color-green-400)' }}>saved</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* AI Approval Prompt */}
                              {!message.approvedAction && (
                                <div className="inline-ai-message ai">
                                  <div className="inline-ai-avatar">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="inline-ai-message-content">
                                    <p>Would you like to approve and implement these recommended actions for Meter {message.context.meterId}?</p>
                                    <div className="inline-ai-actions">
                                      <button
                                        onClick={() => {
                                          setChatMessages(prev => prev.map(msg => 
                                            msg.id === message.id 
                                              ? { ...msg, approvedAction: true }
                                              : msg
                                          ))
                                          handleMeterImplementation(message.id, message.context.meterId, message.context.status)
                                        }}
                                        className="inline-ai-btn inline-ai-btn-approve"
                                      >
                                        <Check className="w-3 h-3" />
                                        Approve Action
                                      </button>
                                      <button className="inline-ai-btn inline-ai-btn-modify">
                                        <PenLine className="w-3 h-3" />
                                        Modify
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Approval Confirmation / Implementation Progress */}
                              {message.approvedAction && (
                                <div className="inline-ai-message ai">
                                  <div className="inline-ai-avatar">
                                    <MessageSquare className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="inline-ai-message-content">
                                    {meterImplementationStates[message.id] === 'in-progress' && (
                                      <>
                                        <p style={{ marginBottom: '8px' }}>Implementing recommended actions for Meter {message.context.meterId}...</p>
                                        <div style={{ 
                                          display: 'flex', 
                                          flexDirection: 'column', 
                                          gap: '6px',
                                          fontSize: '10px',
                                          color: 'var(--color-gray-300)'
                                        }}>
                                          {meterImplementationSteps[message.id]?.map((step) => (
                                            <div key={step.id} style={{ 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              gap: '6px'
                                            }}>
                                              <span style={{ 
                                                color: 'var(--color-green-400)',
                                                fontSize: '12px'
                                              }}>✓</span>
                                              <span>{step.label}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {meterImplementationStates[message.id] === 'complete' && (
                                      <>
                                        <p style={{ 
                                          color: 'var(--color-green-400)', 
                                          fontWeight: 'var(--font-weight-semibold)', 
                                          marginBottom: '8px' 
                                        }}>
                                          ✓ Implementation Complete
                                        </p>
                                        <p>
                                          All recommended actions for Meter {message.context.meterId} have been successfully implemented. 
                                          {message.context.status === 'critical' 
                                            ? ` Field crew dispatched, zone isolation prepared, and downstream monitoring activated. Work order #${Math.floor(Math.random() * 9000) + 1000} created.`
                                            : ` Monitoring frequency increased, historical analysis initiated, and preventive inspection scheduled. Work order #${Math.floor(Math.random() * 9000) + 1000} created.`
                                          }
                                        </p>
                                      </>
                                    )}
                                    {!meterImplementationStates[message.id] && (
                                      <>
                                        <p style={{ color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)', marginBottom: '8px' }}>
                                          ✓ Action Approved
                                        </p>
                                        <p>
                                          Recommended actions for Meter {message.context.meterId} have been approved. Implementation in progress...
                                        </p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                /* Multiple contexts - horizontal compact cards */
                <>
                  {/* Visual indicator */}
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>
                      {contextCount} Event Contexts
                    </span>
                  </div>
                  
                  {/* Horizontal card container */}
                  <div className={expandedCardId ? "flex gap-2 mb-3" : "flex gap-2 mb-3"}>
                    {expandedCardId ? (
                      /* When a card is expanded: 80/20 layout with vertical stacking */
                      <>
                        {/* Expanded card - 80% width */}
                        {eventContextMessages.filter(msg => msg.id === expandedCardId).map((message) => (
                          <div
                            key={message.id}
                            onClick={() => handleCardClick(message.id)}
                            className="rounded-lg border p-3 cursor-pointer transition-all"
                            style={{
                              width: '80%',
                              backgroundColor: 'var(--color-gray-600)',
                              borderColor: 'var(--sand-teal)',
                            }}
                          >
                            {/* Header with icon and event name */}
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div 
                                  className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                  style={{ backgroundColor: 'var(--sand-teal)' }}
                                >
                                  <MessageSquare className="w-3 h-3" style={{ color: 'var(--color-white)' }} />
                                </div>
                                <span 
                                  className="font-semibold truncate" 
                                  style={{ 
                                    fontSize: 'var(--text-sm)', 
                                    color: 'var(--color-gray-100)' 
                                  }}
                                >
                                  {message.context.eventName}
                                </span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteMessage(message.id) }}
                                className="inline-flex items-center justify-center rounded-md h-5 w-5 transition-colors shrink-0 ml-1"
                                style={{ color: 'var(--color-gray-400)' }}
                                title="Remove context"
                                onMouseEnter={(e) => { 
                                  e.currentTarget.style.backgroundColor = 'var(--color-red-600)'
                                  e.currentTarget.style.color = 'var(--color-white)' 
                                }}
                                onMouseLeave={(e) => { 
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                  e.currentTarget.style.color = 'var(--color-gray-400)' 
                                }}
                              >
                                <X className="w-3 h-3" aria-hidden="true" />
                              </button>
                            </div>
                            
                            {/* Expanded details */}
                            <div className="space-y-1.5 mt-2">
                              <div className="flex justify-between">
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Date:</span>
                                <span className="font-medium text-right" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                  {message.context.dateTimeRange}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Affected Pipes:</span>
                                <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                  {message.context.affectedPipes} ({message.context.threshold})
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Customers:</span>
                                <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                  {message.context.customersAffected?.toLocaleString() || 'N/A'}
                                </span>
                              </div>
                              {message.context.severity && (
                              <div className="flex justify-between items-start">
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Severity:</span>
                                <div className="flex gap-1 flex-wrap justify-end">
                                  {message.context.severity.map((sev, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1.5 py-0.5 rounded"
                                      style={{
                                        fontSize: '10px',
                                        backgroundColor: sev.color === 'red' ? 'var(--color-red-600)' : 'var(--color-orange-600)',
                                        color: 'var(--color-white)',
                                      }}
                                    >
                                      {sev.count} {sev.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              )}
                              {/* Meter-specific fields */}
                              {message.context.source === 'Network Meter Details' && (
                                <>
                                  <div className="flex justify-between">
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Meter ID:</span>
                                    <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                      {message.context.meterId}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Status:</span>
                                    <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                      {message.context.statusLabel}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Pressure:</span>
                                    <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                      {message.context.pressureDisplay}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Flow:</span>
                                    <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                      {message.context.flow} L/min
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Quality:</span>
                                    <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                      {message.context.quality}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>Impact:</span>
                                    <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-200)' }}>
                                      {message.context.impact}
                                    </span>
                                  </div>
                                </>
                              )}
                              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-gray-600)' }}>
                                <span className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-300)' }}>
                                  {message.context.recommendation?.title || message.context.description || 'Recommendation'}:
                                </span>
                                <p className="mt-1" style={{ fontSize: '10px', color: 'var(--color-gray-400)', lineHeight: '1.4' }}>
                                  {message.context.recommendation?.description || message.context.description || message.context.recommendation}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* Non-expanded cards - vertical stack at 20% width */}
                        <div className="flex flex-col gap-2" style={{ width: '20%' }}>
                          {eventContextMessages.filter(msg => msg.id !== expandedCardId).map((message) => (
                            <div
                              key={message.id}
                              onClick={() => handleCardClick(message.id)}
                              className="rounded-lg border p-2 cursor-pointer transition-all"
                              style={{
                                backgroundColor: 'var(--color-gray-700)',
                                borderColor: 'var(--color-gray-600)',
                              }}
                            >
                              {/* Compact header */}
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <div 
                                    className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: 'var(--sand-teal)' }}
                                  >
                                    <MessageSquare className="w-2.5 h-2.5" style={{ color: 'var(--color-white)' }} />
                                  </div>
                                  <span 
                                    className="font-semibold truncate" 
                                    style={{ 
                                      fontSize: '10px', 
                                      color: 'var(--color-gray-100)' 
                                    }}
                                  >
                                    {message.context.eventName}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteMessage(message.id) }}
                                  className="inline-flex items-center justify-center rounded-md h-4 w-4 transition-colors shrink-0 ml-1"
                                  style={{ color: 'var(--color-gray-400)' }}
                                  title="Remove context"
                                  onMouseEnter={(e) => { 
                                    e.currentTarget.style.backgroundColor = 'var(--color-red-600)'
                                    e.currentTarget.style.color = 'var(--color-white)' 
                                  }}
                                  onMouseLeave={(e) => { 
                                    e.currentTarget.style.backgroundColor = 'transparent'
                                    e.currentTarget.style.color = 'var(--color-gray-400)' 
                                  }}
                                >
                                  <X className="w-2.5 h-2.5" aria-hidden="true" />
                                </button>
                              </div>
                              
                              {/* Compact KPIs */}
                              <div className="space-y-1 mt-1">
                                <div className="flex justify-between items-center">
                                  <span style={{ fontSize: '9px', color: 'var(--color-gray-400)' }}>Pipes:</span>
                                  <span className="font-medium" style={{ fontSize: '9px', color: 'var(--color-gray-200)' }}>
                                    {message.context.affectedPipes}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span style={{ fontSize: '9px', color: 'var(--color-gray-400)' }}>Cust:</span>
                                  <span className="font-medium" style={{ fontSize: '9px', color: 'var(--color-gray-200)' }}>
                                    {message.context.customersAffected >= 1000 
                                      ? (message.context.customersAffected / 1000).toFixed(1) + 'K' 
                                      : message.context.customersAffected}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      /* No card expanded: horizontal layout with equal sizing */
                      eventContextMessages.map((message) => (
                        <div
                          key={message.id}
                          onClick={() => handleCardClick(message.id)}
                          className="flex-1 min-w-0 rounded-lg border p-3 cursor-pointer transition-all"
                          style={{
                            backgroundColor: 'var(--color-gray-700)',
                            borderColor: 'var(--color-gray-600)',
                            maxWidth: '180px',
                          }}
                        >
                          {/* Header with icon and event name */}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div 
                                className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                style={{ backgroundColor: 'var(--sand-teal)' }}
                              >
                                <MessageSquare className="w-3 h-3" style={{ color: 'var(--color-white)' }} />
                              </div>
                              <span 
                                className="font-semibold truncate" 
                                style={{ 
                                  fontSize: 'var(--text-xs)', 
                                  color: 'var(--color-gray-100)' 
                                }}
                              >
                                {message.context.eventName}
                              </span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMessage(message.id) }}
                              className="inline-flex items-center justify-center rounded-md h-5 w-5 transition-colors shrink-0 ml-1"
                              style={{ color: 'var(--color-gray-400)' }}
                              title="Remove context"
                              onMouseEnter={(e) => { 
                                e.currentTarget.style.backgroundColor = 'var(--color-red-600)'
                                e.currentTarget.style.color = 'var(--color-white)' 
                              }}
                              onMouseLeave={(e) => { 
                                e.currentTarget.style.backgroundColor = 'transparent'
                                e.currentTarget.style.color = 'var(--color-gray-400)' 
                              }}
                            >
                              <X className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </div>
                          
                          {/* Compact KPIs */}
                          <div className="space-y-1.5 mt-2">
                            <div className="flex justify-between items-center">
                              <span style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>Pipes:</span>
                              <span className="font-medium" style={{ fontSize: '10px', color: 'var(--color-gray-200)' }}>
                                {message.context.affectedPipes}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>Customers:</span>
                              <span className="font-medium" style={{ fontSize: '10px', color: 'var(--color-gray-200)' }}>
                                {message.context.customersAffected >= 1000 
                                  ? (message.context.customersAffected / 1000).toFixed(1) + 'K' 
                                  : message.context.customersAffected}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Action prompts */}
                  <div className="space-y-2">
                    <p className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                      What would you like to do?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {actionPrompts.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          disabled={id !== 'analyze-impact'}
                          onClick={() => handleActionClick(id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${id !== 'analyze-impact' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          style={{
                            fontSize: 'var(--text-xs)',
                            backgroundColor: 'rgba(55, 65, 81, 0.6)',
                            borderColor: 'var(--color-gray-600)',
                            color: 'var(--color-gray-300)',
                          }}
                          onMouseEnter={(e) => {
                            if (e.currentTarget.disabled) return
                            e.currentTarget.style.backgroundColor = 'var(--sand-teal)'
                            e.currentTarget.style.borderColor = 'var(--sand-teal)'
                            e.currentTarget.style.color = 'var(--color-white)'
                          }}
                          onMouseLeave={(e) => {
                            if (e.currentTarget.disabled) return
                            e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.6)'
                            e.currentTarget.style.borderColor = 'var(--color-gray-600)'
                            e.currentTarget.style.color = 'var(--color-gray-300)'
                          }}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="leading-tight">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              
              {/* Typing Indicator */}
              {isAiResponding && (
                <div className="flex items-start gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'var(--sand-teal)' }}
                  >
                    <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-white)' }} />
                  </div>
                  <div className="flex items-center gap-1 px-3 py-2">
                    <span className="animate-pulse" style={{ fontSize: '18px', color: 'var(--sand-teal)' }}>●</span>
                    <span className="animate-pulse" style={{ fontSize: '18px', color: 'var(--sand-teal)', animationDelay: '0.2s' }}>●</span>
                    <span className="animate-pulse" style={{ fontSize: '18px', color: 'var(--sand-teal)', animationDelay: '0.4s' }}>●</span>
                  </div>
                </div>
              )}
              
              {/* Error Display */}
              {aiError && (
                <div 
                  className="rounded-lg border px-3 py-2 mb-3"
                  style={{ 
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    borderColor: 'var(--color-red-500)'
                  }}
                >
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red-400)' }}>
                    {aiError}
                  </p>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>
          </div>
        ) : activeTab === 'intelligence' ? (
          /* Intelligence Tab */
          <div className="flex flex-col h-full px-3 py-2 overflow-y-auto">
            {intelligenceItems.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Lightbulb className="w-12 h-12 mb-3" style={{ color: 'var(--color-gray-600)' }} />
                <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-300)' }}>
                  No intelligence reports yet
                </p>
                <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>
                  Analysis results will appear here
                </p>
              </div>
            ) : (
              /* Intelligence items */
              <div className="space-y-3">
                {intelligenceItems.map((item) => {
                  const eventMetrics = EVENT_METRICS[item.eventId] || EVENT_METRICS['water-main-burst-downtown']
                  const timeDiff = Math.floor((Date.now() - new Date(item.timestamp).getTime()) / 60000)
                  const timeAgo = timeDiff < 60 ? `${timeDiff} min ago` : `${Math.floor(timeDiff / 60)} hour${Math.floor(timeDiff / 60) > 1 ? 's' : ''} ago`
                  
                  return (
                    <React.Fragment key={item.id}>
                    <div
                      className="rounded-lg border overflow-hidden"
                      style={{
                        backgroundColor: 'var(--color-gray-700)',
                        borderColor: 'var(--color-gray-600)',
                      }}
                    >
                      {/* Header with badges - typography matches Event Affected Area */}
                      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-gray-600)' }}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="px-2 py-0.5 rounded shrink-0"
                              style={{
                                fontSize: 'var(--text-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                backgroundColor: 'var(--color-red-500)',
                                color: 'var(--color-white)',
                              }}
                            >
                              Critical
                            </span>
                            <span className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>
                              {timeAgo} · {item.category || eventMetrics.category}
                            </span>
                          </div>
                          <button
                            className="p-1 shrink-0"
                            style={{ borderRadius: 'var(--radius-sm)', color: 'var(--color-gray-400)' }}
                            title="Expand"
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-gray-100)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-gray-400)'}
                          >
                            <ChevronDown className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                        <h2 className="text-sm font-semibold leading-tight truncate mb-1" style={{ color: 'var(--color-gray-100)' }}>
                          {item.eventName}
                        </h2>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)', lineHeight: 1.4 }}>
                          {item.description || eventMetrics.description}
                        </p>
                      </div>

                      {/* Mini-Map showing burst location */}
                      <div 
                        className="px-3 py-2"
                        style={{ borderBottom: '1px solid var(--color-gray-600)' }}
                      >
                        <label className="block mb-1.5" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                          Burst Location
                        </label>
                        <div
                          className="rounded-lg overflow-hidden"
                          style={{
                            height: '180px',
                            border: '1px solid var(--color-gray-600)',
                          }}
                        >
                          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)' }}>Location data unavailable</span>
                          </div>
                        </div>
                      </div>

                      {/* Pressure Chart - typography matches Event Affected Area */}
                      <div 
                        className="px-3 py-2 border relative overflow-hidden"
                        style={{
                          backgroundColor: 'var(--color-gray-800)',
                          borderColor: 'var(--color-gray-600)',
                          borderWidth: '0 0 1px 0',
                          borderRadius: 0,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <label className="block" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                            PSI Pressure Timeline
                          </label>
                          <span
                            className="px-2 py-0.5 rounded"
                            style={{
                              fontSize: 'var(--text-xs)',
                              fontWeight: 'var(--font-weight-semibold)',
                              backgroundColor: 'var(--color-gray-600)',
                              color: 'var(--color-gray-200)',
                            }}
                          >
                            Optimized
                          </span>
                        </div>
                          <div className="flex items-center justify-center py-4" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)' }}>Chart data unavailable</span>
                          </div>
                      </div>

                      {/* Recommended Action - matches Event Affected Area */}
                      {item.contexts[0]?.recommendation && (
                        <div className="px-3 py-2" style={{ borderTop: '1px solid var(--color-gray-600)' }}>
                          <div className="flex items-center gap-1.5 font-semibold mb-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            Recommended Action
                          </div>
                          <div className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                            {item.contexts[0].recommendation.title}
                          </div>
                          <p className="mt-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-400)' }}>
                            {item.contexts[0].recommendation.description}
                          </p>
                        </div>
                      )}

                      {/* Impact Metrics - matches Event Affected Area */}
                      <div className="px-3 py-2 pt-2.5" style={{ borderTop: '1px solid var(--color-gray-600)' }}>
                        <div className="flex items-center gap-1.5 font-semibold mb-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                          <Users className="w-3.5 h-3.5" aria-hidden="true" />
                          Impact Metrics
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                              Customers Affected
                            </p>
                            <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>
                              {eventMetrics.customersAffected?.toLocaleString()}
                            </p>
                          </div>
                          
                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                              Water Loss Rate
                            </p>
                            <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>
                              {eventMetrics.waterLossRate}
                            </p>
                          </div>
                          
                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                              System Pressure
                            </p>
                            <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>
                              {eventMetrics.systemPressure}
                            </p>
                          </div>
                          
                          <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                            <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                              Estimated Repair Time
                            </p>
                            <p className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>
                              {eventMetrics.repairTime}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Copilot Conversational Prompt - OUTSIDE THE CARD */}
                    {!viewOptimizedStates[item.id] && (
                      <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                        <div className="inline-ai-avatar">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <div className="inline-ai-message-content">
                          <p>Would you like to see the optimized metrics after implementing the recommended action?</p>
                          <div className="inline-ai-actions">
                            <button
                              onClick={() => setViewOptimizedStates(prev => ({
                                ...prev,
                                [item.id]: true
                              }))}
                              className="inline-ai-btn inline-ai-btn-approve"
                            >
                              Yes, Show Optimized
                            </button>
                            <button className="inline-ai-btn inline-ai-btn-modify">
                              Not Now
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Copilot Response and Optimized Metrics - OUTSIDE THE CARD */}
                    {viewOptimizedStates[item.id] && (
                      <>
                        {/* Copilot Response Message */}
                        <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                          <div className="inline-ai-avatar">
                            <MessageSquare className="w-3.5 h-3.5" />
                          </div>
                          <div className="inline-ai-message-content">
                            <p>Here's how the metrics would improve with the recommended action implemented:</p>
                          </div>
                        </div>

                        {/* Optimized Metrics Card - typography matches Impact Metrics */}
                        <div
                          className="rounded-lg border overflow-hidden mt-3"
                          style={{
                            backgroundColor: 'var(--color-gray-700)',
                            borderColor: 'var(--color-gray-600)',
                          }}
                        >
                          <div className="px-3 py-2 pt-2.5">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1.5 font-semibold" style={{ fontSize: 'var(--text-xs)', color: 'var(--sand-teal)' }}>
                                <ChartColumn className="w-3.5 h-3.5" aria-hidden="true" />
                                Optimized Impact Metrics
                              </div>
                              <button
                                onClick={() => setViewOptimizedStates(prev => ({ ...prev, [item.id]: false }))}
                                className="px-2 py-1 rounded transition-colors"
                                style={{
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 'var(--font-weight-medium)',
                                  color: 'var(--color-gray-400)',
                                  backgroundColor: 'var(--color-gray-600)',
                                  border: '1px solid var(--color-gray-500)',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--color-gray-500)'
                                  e.currentTarget.style.color = 'var(--color-gray-100)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'var(--color-gray-600)'
                                  e.currentTarget.style.color = 'var(--color-gray-400)'
                                }}
                              >
                                View Current
                              </button>
                            </div>
                            {(() => {
                              const optimizedMetrics = OPTIMIZED_METRICS[item.eventId] || eventMetrics
                              return (
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                                      Customers Affected
                                    </p>
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                                        {optimizedMetrics.customersAffected?.toLocaleString()}
                                      </span>
                                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>
                                        ↓{Math.round((1 - optimizedMetrics.customersAffected / eventMetrics.customersAffected) * 100)}%
                                      </span>
                                    </div>
                                  </div>
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                                      Water Loss Rate
                                    </p>
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                                        {optimizedMetrics.waterLossRate}
                                      </span>
                                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>
                                        ↓81%
                                      </span>
                                    </div>
                                  </div>
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                                      System Pressure
                                    </p>
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                                        {optimizedMetrics.systemPressure}
                                      </span>
                                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>
                                        ↑164%
                                      </span>
                                    </div>
                                  </div>
                                  <div className="rounded p-2" style={{ backgroundColor: 'var(--color-gray-800)' }}>
                                    <p className="mb-1" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-gray-400)' }}>
                                      Estimated Repair Time
                                    </p>
                                    <div className="flex items-baseline gap-1.5">
                                      <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-100)' }}>
                                        {optimizedMetrics.repairTime}
                                      </span>
                                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-green-400)', fontWeight: 'var(--font-weight-semibold)' }}>
                                        ↓62%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        </div>

                        {/* Copilot Action Prompt - After Optimized Metrics */}
                        {!implementationStates[item.id] && (
                          <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                            <div className="inline-ai-avatar">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </div>
                            <div className="inline-ai-message-content">
                              <p>Would you like to proceed with implementing this recommended action?</p>
                              <div className="inline-ai-actions">
                                <button 
                                  onClick={() => handleImplementation(item.id)}
                                  className="inline-ai-btn inline-ai-btn-approve"
                                >
                                  Approve/Implement
                                </button>
                                <button className="inline-ai-btn inline-ai-btn-modify">
                                  Not Now
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Implementation Progress */}
                        {implementationStates[item.id] && (
                          <div className="inline-ai-message ai" style={{ marginTop: '12px' }}>
                            <div className="inline-ai-avatar">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </div>
                            <div className="inline-ai-message-content">
                              {implementationStates[item.id] === 'in-progress' && (
                                <>
                                  <p style={{ marginBottom: '8px' }}>Implementing recommended action...</p>
                                  <div style={{ 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '6px',
                                    fontSize: '10px',
                                    color: 'var(--color-gray-300)'
                                  }}>
                                    {implementationSteps[item.id]?.map((step, idx) => (
                                      <div key={step.id} style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '6px',
                                        opacity: 0,
                                        animation: 'fadeIn 0.3s ease-in forwards',
                                        animationDelay: '0.1s'
                                      }}>
                                        <span style={{ 
                                          color: 'var(--color-green-400)',
                                          fontSize: '12px'
                                        }}>✓</span>
                                        <span>{step.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                              {implementationStates[item.id] === 'complete' && (
                                <div>
                                  <p style={{ 
                                    marginBottom: '8px',
                                    color: 'var(--color-green-400)',
                                    fontWeight: 'var(--font-weight-semibold)'
                                  }}>
                                    ✓ Implementation Successful
                                  </p>
                                  <p style={{ 
                                    fontSize: '11px',
                                    color: 'var(--color-gray-300)',
                                    lineHeight: '1.5'
                                  }}>
                                    The recommended action has been successfully implemented. Field crew has been dispatched to {eventMetrics.description.split('at')[1] || 'the location'}. Work permits and road closures are in place. Estimated completion time: {eventMetrics.repairTime}.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </React.Fragment>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          /* Briefing Tab */
          <div className="flex flex-col h-full px-3 py-2 overflow-y-auto">
            <div className="flex items-center gap-2.5 mb-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  backgroundColor: 'var(--color-gray-700)',
                  border: '1px solid var(--color-gray-600)',
                }}
              >
                {/* Copilot avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--sand-teal)' }}
                >
                  <MessageSquare className="w-4 h-4" style={{ color: 'var(--color-white)' }} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-tight" style={{ color: 'var(--color-gray-100)' }}>
                  Sand Intelligence Assistant
                </h3>
                <p className="leading-tight" style={{ fontSize: '11px', color: 'var(--color-gray-400)' }}>
                  Burst detection wiki & operational assistant
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              {questions.map(({ icon: Icon, text }, i) => (
                <button
                  key={i}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all group"
                  style={{
                    fontSize: 'var(--text-xs)',
                    backgroundColor: 'rgba(55, 65, 81, 0.6)',
                    borderColor: 'var(--color-gray-600)',
                    color: 'var(--color-gray-300)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-gray-700)'
                    e.currentTarget.style.borderColor = 'var(--color-gray-500)'
                    e.currentTarget.style.color = 'var(--color-gray-100)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(55, 65, 81, 0.6)'
                    e.currentTarget.style.borderColor = 'var(--color-gray-600)'
                    e.currentTarget.style.color = 'var(--color-gray-300)'
                  }}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: 'var(--sand-teal)' }}>
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span className="leading-relaxed">{text}</span>
                </button>
              ))}
            </div>
            <p className="text-center mt-3" style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>
              Tap a question above, or type your own below
            </p>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--color-gray-700)' }}>
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors"
          style={{
            backgroundColor: 'var(--color-gray-700)',
            borderColor: isAiResponding ? 'var(--sand-teal)' : 'var(--color-gray-600)',
          }}
        >
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the network..."
            rows="1"
            disabled={isAiResponding}
            className="flex-1 bg-transparent resize-none outline-none disabled:opacity-50 max-h-24 overflow-y-auto"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-gray-100)',
              minHeight: '20px',
            }}
          ></textarea>
          <button
            onClick={handleSendMessage}
            className="inline-flex items-center justify-center rounded-md h-7 w-7 shrink-0 transition-colors disabled:opacity-30"
            style={{ color: 'var(--sand-teal)' }}
            disabled={!inputText.trim() || isAiResponding}
            title="Send message"
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'rgba(46, 185, 194, 0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="text-center mt-1.5" style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>
          {isAiResponding ? 'AI is responding...' : 'Ask questions about water infrastructure events and metrics'}
        </p>
      </div>
    </div>
  )
}
