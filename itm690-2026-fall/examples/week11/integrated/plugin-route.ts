          if (url.pathname === '/api/review') {
            if (req.method !== 'POST') return send(res, 200, latestReport() ?? { empty: true })
            // 진행 상황과 모델 토큰을 NDJSON 으로 흘려보낸다 (한 줄 = 이벤트 하나)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            res.setHeader('X-Accel-Buffering', 'no')
            res.flushHeaders?.()
            const emit = (e: unknown) => res.write(JSON.stringify(e) + '\n')
            try {
              await convene(force, emit)
            } catch (e) {
              emit({ type: 'error', message: e instanceof Error ? e.message : String(e) })
            }
            return res.end()
