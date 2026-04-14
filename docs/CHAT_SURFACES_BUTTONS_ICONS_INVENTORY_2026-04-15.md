# Chat Surfaces Inventory (Buttons, Icons, Pages)

Date: 2026-04-15

This inventory is prepared for the next UI/UX update cycle for:
- Desktop web
- Mobile web
- App shell (APK/AAB)

## 1) Full Chat Surface Scope

Core user chat pages:
- [client/src/pages/chat.tsx](client/src/pages/chat.tsx)
- [client/src/pages/friends.tsx](client/src/pages/friends.tsx)
- [client/src/pages/challenge-game.tsx](client/src/pages/challenge-game.tsx)
- [client/src/pages/challenge-watch.tsx](client/src/pages/challenge-watch.tsx)

Core chat components:
- [client/src/components/chat-pin-lock.tsx](client/src/components/chat-pin-lock.tsx)
- [client/src/components/chat-media.tsx](client/src/components/chat-media.tsx)
- [client/src/components/chat-auto-delete.tsx](client/src/components/chat-auto-delete.tsx)
- [client/src/components/games/GameChat.tsx](client/src/components/games/GameChat.tsx)
- [client/src/components/games/VoiceChat.tsx](client/src/components/games/VoiceChat.tsx)
- [client/src/components/games/chess/ChessChat.tsx](client/src/components/games/chess/ChessChat.tsx)
- [client/src/components/support-chat-widget.tsx](client/src/components/support-chat-widget.tsx)

Admin chat/support surfaces:
- [client/src/pages/admin/admin-chat.tsx](client/src/pages/admin/admin-chat.tsx)
- [client/src/pages/admin/admin-support.tsx](client/src/pages/admin/admin-support.tsx)
- [client/src/pages/admin/admin-support-settings.tsx](client/src/pages/admin/admin-support-settings.tsx)

## 2) Private Chat Page Inventory

Source: [client/src/pages/chat.tsx](client/src/pages/chat.tsx)

### 2.1 Buttons and Actions
1. Conversation row button: open selected conversation.
2. Back button (mobile): return to conversation list.
3. Header search toggle: open/close in-chat search bar.
4. Header call menu trigger: opens call + PIN menu.
5. Call menu item: start voice call session.
6. Call menu item: start video call session.
7. Call menu item: open PIN setup/settings.
8. Recovered call join button: rejoin active session.
9. End call button (header).
10. Auto-translate toggle button.
11. Language selector trigger button.
12. Language selector items (dynamic list) for target language.
13. Bubble style menu trigger.
14. Bubble style options: vivid, classic, compact.
15. Call strip join button (when session active).
16. Call strip end button.
17. In-chat search close button.
18. Message translation toggle text button (show original/show translation).
19. Reaction chip buttons (toggle reaction by emoji).
20. Quick reactions menu trigger.
21. Quick reaction emoji buttons.
22. Reply button on message.
23. Translate button on message.
24. Edit button on own text message.
25. Delete menu trigger on message.
26. Delete menu item: delete for me.
27. Delete menu item: delete for all.
28. Scroll-to-bottom floating button.
29. Reply/edit bar close button.
30. Failed message retry button.
31. Disappearing mode toggle button.
32. Media upload button (delegated component).
33. Auto-delete settings toggle button (delegated component).
34. Send button (text/edit mode).
35. Voice record button.
36. Voice record cancel button.
37. Voice record stop/send button.

### 2.2 Icons Used
MessageCircle, Send, Check, CheckCheck, Loader2, AlertCircle, Search, Timer, ArrowLeft, Shield, Lock, Paperclip, Reply, Trash2, Pencil, Smile, X, CornerDownRight, Mic, MicOff, ChevronDown, Languages, Palette, Phone, Video, PhoneCall, PhoneOff.

### 2.3 Dialogs/Overlays in This Page
1. PIN setup dialog.
2. Media purchase dialog.
3. Auto-delete purchase dialog.
4. Auto-delete settings dialog.

### 2.4 Update Targets
1. Desktop web: keep header actions grouped, preserve hover message actions, keep shortcut density.
2. Mobile web: maintain large touch targets for top actions and composer actions, ensure sticky composer never collides with nav.
3. App shell: preserve safe-area bottom offsets and modal heights for keyboard and gesture navigation.

## 3) Friends Page Inventory

Source: [client/src/pages/friends.tsx](client/src/pages/friends.tsx)

### 3.1 Buttons and Actions
1. UserCard action (friend): open private chat.
2. UserCard action (friend): start challenge flow.
3. Following action: unfollow.
4. Follower action: unfollow or follow back.
5. Requests actions: accept, reject.
6. Pending sent request actions: pending state + cancel request.
7. Search result actions: accept/reject incoming, send request, cancel request.
8. Blocked action: unblock.
9. Block toggle icon button for non-blocked contexts.
10. Search clear button.
11. Stealth mode visibility toggle button.
12. Tab buttons (friends, following, followers, requests, blocked).
13. Search scope tab buttons (all, friends, following, followers, blocked).

### 3.2 Icons Used
Users, Globe, UserPlus, UserMinus, Search, MessageCircle, Swords, Ban, Loader2, X, UserCheck, ShieldOff, Eye, EyeOff.

### 3.3 Update Targets
1. Desktop web: keep dense card actions with clear hierarchy between primary/secondary actions.
2. Mobile web: ensure action buttons stay wrapped, not clipped, with stable spacing for long usernames.
3. App shell: maintain smooth horizontal tab scrolling and avoid accidental touch overlap with bottom nav.

## 4) Challenge Game Chat/Voice Inventory

Sources:
- [client/src/pages/challenge-game.tsx](client/src/pages/challenge-game.tsx)
- [client/src/components/games/GameChat.tsx](client/src/components/games/GameChat.tsx)
- [client/src/components/games/VoiceChat.tsx](client/src/components/games/VoiceChat.tsx)

### 4.1 Chat/Voice Actions in Page
1. Opponent profile popover trigger button.
2. Opponent voice listen toggle button.
3. Opponent social actions: view profile, follow/unfollow, add friend.
4. Self profile popover trigger button.
5. Self mic toggle button.
6. Resign button.
7. Offer draw button.
8. Draw response buttons: accept, decline.
9. Mobile chat FAB button (open match chat).
10. Mobile chat dialog open/close through dialog state.

### 4.2 GameChat Component Actions
1. Toggle chat bubble button.
2. Toggle quick messages panel button.
3. Toggle chat history panel button.
4. Close quick panel button.
5. Close chat history panel button.
6. Message menu trigger in history (per sender).
7. Message menu item: block sender.
8. Message menu item: mute sender.
9. Quick message send buttons.
10. History input send button.

### 4.3 VoiceChat Component Actions
1. Connection status badge (interactive tooltip context).
2. Local mic mute/unmute button (player role).
3. Per-peer audio mute/unmute buttons.

### 4.4 Icons Used (Chat/Voice Relevant)
MessageCircle, Mic, MicOff, Volume2, VolumeX, UserPlus, Clock, Eye, Users, X, Flag, ArrowRightLeft, Loader2.

### 4.5 Update Targets
1. Desktop web: keep overlays outside board interaction zones and preserve visibility of voice controls.
2. Mobile web: FAB placement must avoid bottom nav and game controls at all times.
3. App shell: prioritize safe-area spacing, haptic-friendly button sizes, and stable dialog heights.

## 5) Challenge Watch Chat/Voice Inventory

Sources:
- [client/src/pages/challenge-watch.tsx](client/src/pages/challenge-watch.tsx)
- [client/src/components/games/VoiceChat.tsx](client/src/components/games/VoiceChat.tsx)

### 5.1 Chat/Voice Actions in Page
1. Player 1 profile popover trigger.
2. Player 1 voice listen toggle.
3. Player 2 profile popover trigger.
4. Player 2 voice listen toggle.
5. Social actions on players: view profile, follow/unfollow, add friend.
6. Mobile chat FAB button (open live chat).
7. Mobile chat send button.
8. Mobile support jump button (chat-adjacent flow).
9. Gift FAB (chat-adjacent engagement).

### 5.2 Live Chat Actions
1. Render live chat list.
2. Mobile input with enter-to-send behavior.
3. Send action disabled on empty input.
4. Auth-required participation notice when user is guest.

### 5.3 Icons Used (Chat/Voice Relevant)
MessageCircle, Volume2, VolumeX, UserPlus, Eye, Users, Clock, Timer, X, Gift.

### 5.4 Update Targets
1. Desktop web: maintain spectator panel readability while preserving live chat cadence.
2. Mobile web: keep dual FABs (chat/support/gift) non-overlapping and thumb-reachable.
3. App shell: ensure modal chat composer remains visible above keyboard and bottom safe-area.

## 6) Support Chat Widget Inventory

Source: [client/src/components/support-chat-widget.tsx](client/src/components/support-chat-widget.tsx)

### 6.1 Floating Support Widget
1. Floating open button with unread badge.
2. Header auto-translate toggle.
3. Header language selector trigger.
4. Language option buttons.
5. Widget close button.
6. Inline translation toggle buttons per message.
7. Human support request button.
8. Media preview remove button.
9. Attach file button.
10. Send message button.

### 6.2 Public Support Contact Panel (SupportChatIcon)
1. Header support trigger button.
2. Panel close button.
3. Contact link cards (external actions).

### 6.3 Icons Used
MessageCircle, X, Send, Loader2, Headphones, MinusCircle, Mail, Phone, ExternalLink, Paperclip, Image, FileText, Download, XCircle, Languages, ChevronDown, ArrowRight.

### 6.4 Update Targets
1. Desktop web: keep widget non-invasive and panel scroll stable.
2. Mobile web: enforce compact but tappable header controls and file-flow clarity.
3. App shell: optimize keyboard transitions and permission prompts for upload flows.

## 7) Chat Feature Component Inventory

### 7.1 PIN Components
Source: [client/src/components/chat-pin-lock.tsx](client/src/components/chat-pin-lock.tsx)

Buttons:
1. PIN setup next.
2. PIN confirm button.
3. Password visibility toggle.
4. Final PIN setup submit.

Icons:
Lock, Eye, EyeOff, Shield, AlertTriangle, KeyRound.

### 7.2 Media Components
Source: [client/src/components/chat-media.tsx](client/src/components/chat-media.tsx)

Buttons:
1. Media upload trigger.
2. Purchase dialog cancel.
3. Purchase dialog confirm.

Icons:
Paperclip, Image, Video, X, Loader2, ShoppingCart, Lock.

### 7.3 Auto-Delete Components
Source: [client/src/components/chat-auto-delete.tsx](client/src/components/chat-auto-delete.tsx)

Buttons:
1. Auto-delete locked-state purchase trigger.
2. Auto-delete active settings trigger.
3. Purchase dialog cancel.
4. Purchase dialog confirm.
5. Settings dialog cancel.
6. Settings dialog save.

Icons:
Timer, ShoppingCart, Loader2, Clock, Trash2.

### 7.4 Chess Chat Component
Source: [client/src/components/games/chess/ChessChat.tsx](client/src/components/games/chess/ChessChat.tsx)

Buttons:
1. Send chat message button.

Icons:
Send.

## 8) Admin Chat Inventory

Source: [client/src/pages/admin/admin-chat.tsx](client/src/pages/admin/admin-chat.tsx)

### 8.1 Global Navigation and Controls
1. Global chat enabled switch.
2. Tabs: overview, support, messages, ai-agent, features, filter, settings.

### 8.2 AI Agent Tab
1. Refresh all AI reports button.
2. Query preset buttons.
3. Query groupBy buttons.
4. Query run/search button.
5. AI chat send button.

### 8.3 Support Tab
1. Tickets refresh button.
2. Ticket filter buttons.
3. Ticket row button (select).
4. Back-to-list button.
5. Auto-translate toggle button.
6. Admin language menu trigger and language option buttons.
7. Close ticket button.
8. Reopen ticket button.
9. Per-message translate quick button.
10. Remove admin media preview button.
11. Attach media button.
12. Send support reply button.

### 8.4 Auto Replies Block
1. Add auto-reply button.
2. Enable/disable auto-reply switch.
3. Delete auto-reply dialog trigger.
4. Delete dialog cancel.
5. Delete dialog confirm.

### 8.5 Word Filter Tab
1. Add banned word button.
2. Remove banned word mini button.

### 8.6 Features Tab
1. Media feature section: update price, grant feature, revoke from user.
2. Auto-delete feature section: update price, grant, revoke.
3. Call pricing section: update prices button.
4. PIN reset section: reset trigger, cancel, confirm.
5. Support media section: global switch, block user button, unblock user button.

### 8.7 Settings Tab
1. Chat enabled switch.
2. Numeric input updates (max length, rate limits) on blur-driven mutations.

### 8.8 Icons Used
MessageCircle, BarChart3, Shield, Trash2, Search, Ban, X, Plus, Eye, MessageSquare, Users, Clock, AlertTriangle, Settings, Filter, Headphones, Send, RefreshCw, CheckCircle2, XCircle, Bot, ArrowLeft, Loader2, Paperclip, FileText, Download, Image, Languages, ChevronDown, PhoneCall, Video.

### 8.9 Update Targets
1. Desktop web: reduce visual crowding in support tab action clusters.
2. Mobile web: ensure tab strip remains performant and actions remain one-handed where possible.
3. App shell: keep dialogs and alert confirmations keyboard-safe and scroll-safe.

## 9) Admin Support Contacts Inventory

Source: [client/src/pages/admin/admin-support.tsx](client/src/pages/admin/admin-support.tsx)

Buttons and switches:
1. Add contact button.
2. Edit contact buttons (mobile and desktop rows).
3. Delete contact buttons (mobile and desktop rows).
4. Active status switches (mobile and desktop rows).
5. Dialog actions: cancel, save.
6. Dialog type selector.
7. Dialog active switch.

Icons:
Headset, Plus, Pencil, Trash2, Save, X, MessageCircle, Phone, Mail, plus social icons from react-icons.

Update targets:
1. Desktop web: keep table density and clear row actions.
2. Mobile web: preserve card-mode action separation and avoid switch/button conflict taps.
3. App shell: dialog form controls must remain visible above virtual keyboard.

## 10) Admin Support Settings Inventory

Source: [client/src/pages/admin/admin-support-settings.tsx](client/src/pages/admin/admin-support-settings.tsx)

Buttons and switches:
1. Header refresh button.
2. Header create settings button.
3. Settings edit button per game type.
4. Tabs: automatic/manual mode.
5. Enabled switch.
6. Instant match switch.
7. Form submit button.
8. Form cancel button.
9. Sliders (win rate, experience, streak weights).
10. Empty-state create settings button.

Icons:
CheckCircle2, Plus, Pencil, RefreshCw, Users, Settings2, Loader2, Percent, DollarSign, Zap, Scale, Trophy, TrendingUp, Flame.

Update targets:
1. Desktop web: keep form segmentation and visual grouping of risk-sensitive fields.
2. Mobile web: simplify slider ergonomics and prevent accidental weight drags.
3. App shell: keep long forms segmented with sticky action/footer behavior.

## 11) Immediate Update Backlog (Desktop + Mobile Web + App)

Priority 1:
1. Unify top action clusters across private chat, challenge game, and challenge watch.
2. Standardize FAB spacing rules with safe-area for all mobile chat entry points.
3. Normalize message action reveal behavior across hover (desktop) and tap/long-press (mobile/app).

Priority 2:
1. Harmonize translation controls layout between private chat, support widget, and admin support conversation.
2. Create one shared touch-size rule for icon-only buttons in all chat surfaces.
3. Standardize badge overflow behavior (99+) across unread counters and live chat counters.

Priority 3:
1. Build a single icon policy map to reduce inconsistent icon semantics (same action, same icon).
2. Improve admin action density on small screens by grouping destructive actions into explicit menus.
3. Add visual states for disabled monetized actions with consistent tooltip/error messaging.

## 12) Notes

1. The file [client/src/pages/challenges.tsx](client/src/pages/challenges.tsx) is challenge listing, not a direct chat surface, so it is excluded from this chat-inventory scope.
2. The list above is prepared as implementation-ready reference for the next responsive redesign sprint.
