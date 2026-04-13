# Mobile UI Page-by-Page Tracker

Date: 2026-04-13
Scope baseline: docs/MOBILE_UI_FULL_INVENTORY_2026-04-13.md

## In Progress
1. /login (mapped to unauth flow): done in this pass
2. global ui foundation (buttons and inputs): done in this pass

## Player Routes
1. / : done in this pass
2. /games : done in this pass
3. /games/history : done in this pass
4. /play/:slug : done in this pass
5. /challenges : done in this pass
6. /challenge/:id/play : done in this pass
7. /challenge/:id/watch : done in this pass
8. /lobby : done in this pass
9. /chat : done in this pass
10. /friends : done in this pass
11. /multiplayer : done in this pass
12. /wallet : done in this pass
13. /transactions : done in this pass
14. /p2p : done in this pass
15. /p2p/profile/:userId? : done in this pass
16. /p2p/settings : done in this pass
17. /free : done in this pass
18. /daily-rewards : done in this pass
19. /notifications : done in this pass
20. /referral : done in this pass
21. /leaderboard : done in this pass
22. /seasons : done in this pass
23. /profile : done in this pass
24. /player/:userId : done in this pass
25. /support : done in this pass
26. /settings : done in this pass
27. /install-app : done in this pass
28. /terms : done in this pass
29. /privacy : done in this pass
30. /tournaments : done in this pass
31. /tournaments/:id : done in this pass
32. /game/chess/:sessionId : done in this pass
33. /game/backgammon/:sessionId : done in this pass
34. /game/domino/:sessionId : done in this pass
35. /game/tarneeb/:sessionId : done in this pass
36. /game/baloot/:sessionId : done in this pass
37. /arcade : done in this pass

## Public and Auth Routes
1. /auth/callback : done in this pass
2. unauth /login : done
3. unauth /challenges : done in this pass

## Admin Routes
1. /admin : done in this pass
2. /admin/dashboard : done in this pass
3. /admin/users : pending
4. /admin/transactions : pending
5. /admin/sections : pending
6. /admin/anti-cheat : pending
7. /admin/analytics : pending
8. /admin/disputes : pending
9. /admin/tournaments : pending
10. /admin/free-play : pending
11. /admin/gifts : pending
12. /admin/p2p : pending
13. /admin/currency : pending
14. /admin/support : pending
15. /admin/app-settings : pending
16. /admin/languages : pending
17. /admin/badges : pending
18. /admin/notifications : pending
19. /admin/games : pending
20. /admin/external-games : pending
21. /admin/game-sections : pending
22. /admin/id-verification : pending
23. /admin/seo : pending
24. /admin/payment-methods : pending
25. /admin/integrations : pending
26. /admin/social-platforms : pending
27. /admin/advertisements : pending
28. /admin/support-settings : pending
29. /admin/challenge-settings : pending
30. /admin/challenges : pending
31. /admin/chat-management : pending
32. /admin/sam9 : pending
33. /admin/audit-logs : pending
34. /admin/payment-security : pending
35. /admin/announcements : pending

## Notes
1. Every touched page must remove legacy UI paths and stale styles in touched scope.
2. Every touched page must be phone-first and safe-area aware.
3. Every touched page must preserve i18n keys with no new hardcoded user text.
4. Shared Input now auto-advances to the next field on Enter and keeps focus centered on mobile viewports.
5. Shared Button now uses the unified 3D VEX visual identity across pages and dialogs.
