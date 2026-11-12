        </>
      )}

      {tab === 'review' && (
        <>
          <section className="card">
            <div className="card-header">
              <h2>검토단 소집</h2>
              <span className="card-note">강세론 · 약세론 병렬 → 리스크·검증 → 종합. 매매 실행은 없다. 결정은 사람이 한다</span>
            </div>
            <div className="review-actions">
              <button onClick={() => void convene()} disabled={reviewLoading || !dash}>
                {reviewLoading ? '호출 중 (의견 A·B 병렬 → 검증)… 약 1분' : '검토단 소집'}
              </button>
              {review && (
                <span className="muted">
                  마지막 소집 {review.convenedAt.replace('T', ' ').slice(0, 16)} · 데이터 {formatDate(review.asOf)} 기준 · 총 비용 ${review.totalCostUsd.toFixed(4)}
                </span>
              )}
            </div>
            <p className="card-note" style={{ display: 'block' }}>
              입력은 현황 탭의 포트폴리오 데이터(자산별 비중·평가액·목표·밴드)뿐이다. 역할 정의서는 <code>prompts/advisor-*.md</code>,
              모델은 역할마다 다른 제공자를 쓴다. 결과는 <code>data/review/</code>에 저장된다.
            </p>
            {reviewError && <div className="error-box">{reviewError}</div>}
          </section>

          {review && (
            <div className={reviewLoading ? 'reloading' : undefined}>
              <div className="review-grid">
                <section className="card">
                  <div className="card-header">
                    <h2>1. 강세론</h2>
                    <span className="card-note">{review.models.bull}</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>자산</th><th>강세 근거</th><th>매력도</th></tr></thead>
                      <tbody>
                        {(review.bull?.table ?? []).map((r: any, i: number) => (
                          <tr key={i}><td>{str(r.asset)}</td><td className="review-text">{str(r.reason)}</td><td>{str(r.attractiveness)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="review-proposal"><b>제안</b> {str(review.bull?.proposal)}</p>
                </section>
                <section className="card">
                  <div className="card-header">
                    <h2>2. 약세론</h2>
                    <span className="card-note">{review.models.bear}</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>자산</th><th>위험 요인</th><th>경계</th></tr></thead>
                      <tbody>
                        {(review.bear?.table ?? []).map((r: any, i: number) => (
                          <tr key={i}><td>{str(r.asset)}</td><td className="review-text">{str(r.risk)}</td><td>{str(r.alert)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="review-proposal"><b>제안</b> {str(review.bear?.proposal)}</p>
                </section>
              </div>

              <section className="card">
                <div className="card-header">
                  <h2>3. 리스크·검증</h2>
                  <span className="card-note">{review.models.risk}</span>
                </div>
                <div className="review-rebuttal">
                  <p><b>반론 · 강세</b> {str(review.risk?.rebuttals?.bull)}</p>
                  <p><b>반론 · 약세</b> {str(review.risk?.rebuttals?.bear)}</p>
                </div>
                {Array.isArray(review.risk?.unverifiable_claims) && review.risk.unverifiable_claims.length > 0 && (
                  <>
                    <div className="eyebrow">데이터로 확인되지 않은 주장</div>
                    <ul className="review-list">
                      {review.risk.unverifiable_claims.map((c: any, i: number) => <li key={i}>{str(c)}</li>)}
                    </ul>
                  </>
                )}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>안</th><th>매매</th><th>밴드 내</th><th>비용 메모</th></tr></thead>
                    <tbody>
                      {(review.risk?.proposals ?? []).map((r: any, i: number) => (
                        <tr key={i}><td>{str(r.name)}</td><td className="review-text">{str(r.trades)}</td><td>{r.within_band === true ? '예' : r.within_band === false ? '아니오' : str(r.within_band)}</td><td className="review-text">{str(r.cost_note)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h2>4. 종합: 의견이 갈린 지점과 남은 질문</h2>
                  <span className="card-note">{review.decision}</span>
                </div>
                <div className="review-grid">
                  <div>
                    <div className="eyebrow">충돌 지점</div>
                    <ul className="review-list">{review.conflicts.map((c, i) => <li key={i}>{str(c)}</li>)}</ul>
                  </div>
                  <div>
                    <div className="eyebrow">사람에게 남기는 질문</div>
                    <ol className="review-list">{review.questions_for_human.map((q, i) => <li key={i}>{str(q)}</li>)}</ol>
                  </div>
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <h2>5. 실행 기록</h2>
                  <span className="card-note">총 비용 ${review.totalCostUsd.toFixed(4)}</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>역할</th><th>모델</th><th>시간</th><th>입력 토큰</th><th>출력 토큰</th><th>비용(USD)</th></tr></thead>
                    <tbody>
                      {review.log.map((l) => (
                        <tr key={l.role}><td>{l.role}</td><td>{l.model}</td><td>{(l.ms / 1000).toFixed(1)}초</td><td>{l.prompt_tokens ?? ''}</td><td>{l.completion_tokens ?? ''}</td><td>{l.cost_usd?.toFixed(4) ?? ''}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}
