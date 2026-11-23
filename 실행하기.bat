@echo off
chcp 65001 > nul
title 까치매스 (KKACHI MATH) 실시간 교실 아케이드 서버
echo ====================================================
echo  🦅 까치매스 (KKACHI MATH) 서버를 시작합니다...
echo ====================================================
start "" "http://localhost:3000"
node server.js
pause
