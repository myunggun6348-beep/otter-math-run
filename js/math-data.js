/**
 * 까치매스 (KKACHI MATH) - 고등학교 1학년 수학 공식 & 개념 짝맞추기 데이터
 */
(function (global) {
  const CHAPTERS = [
    {
      id: 'ch1',
      title: '① 다항식 · 인수분해',
      pairs: [
        { id: 'c1_1', q: '$a^3 + b^3$ 의 곱셈공식 변형', a: '$(a+b)^3 - 3ab(a+b)$' },
        { id: 'c1_2', q: '$a^3 - b^3$ 의 인수분해', a: '$(a-b)(a^2 + ab + b^2)$' },
        { id: 'c1_3', q: '$(a+b+c)^2$ 의 전개식', a: '$a^2+b^2+c^2 + 2(ab+bc+ca)$' },
        { id: 'c1_4', q: '$P(x)$를 $(x - 2)$로 나눈 나머지', a: '$P(2)$ (나머지정리)' },
        { id: 'c1_5', q: '$P(x)$가 $(x - 1)$로 나누어떨어질 조건', a: '$P(1) = 0$ (인수정리)' },
        { id: 'c1_6', q: '$a^2 + b^2$ 의 곱셈공식 변형', a: '$(a+b)^2 - 2ab$' },
        { id: 'c1_7', q: '$(x - y)^2$ 을 $(x + y)^2$ 으로 나타내면?', a: '$(x+y)^2 - 4xy$' },
        { id: 'c1_8', q: '$x^3 - 1$ 의 인수분해', a: '$(x - 1)(x^2 + x + 1)$' }
      ]
    },
    {
      id: 'ch2',
      title: '② 복소수 · 이차방정식',
      pairs: [
        { id: 'c2_1', q: '허수단위 $i$의 제곱 ($i^2$)', a: '$-1$' },
        { id: 'c2_2', q: '$i + i^2 + i^3 + i^4$ 의 값', a: '$0$ (4개씩 합이 0)' },
        { id: 'c2_3', q: '복소수 $3 - 4i$ 의 켤레복소수', a: '$3 + 4i$' },
        { id: 'c2_4', q: '$ax^2+bx+c=0$ 의 두 근의 합 ($\alpha + \beta$)', a: '$-\frac{b}{a}$' },
        { id: 'c2_5', q: '$ax^2+bx+c=0$ 의 두 근의 곱 ($\alpha\beta$)', a: '$\frac{c}{a}$' },
        { id: 'c2_6', q: '이차방정식이 서로 다른 두 실근을 가질 조건', a: '판별식 $D = b^2 - 4ac > 0$' },
        { id: 'c2_7', q: '이차방정식이 중근(완전제곱식)을 가질 조건', a: '판별식 $D = b^2 - 4ac = 0$' },
        { id: 'c2_8', q: '이차함수의 그래프가 $x$축과 만나지 않을 조건', a: '판별식 $D < 0$ (허근)' }
      ]
    },
    {
      id: 'ch3',
      title: '③ 도형의 방정식',
      pairs: [
        { id: 'c3_1', q: '기울기가 $m, m\'$인 두 직선이 수직일 조건', a: '$m \cdot m\' = -1$' },
        { id: 'c3_2', q: '중심이 $(a, b)$, 반지름이 $r$인 원의 방정식', a: '$(x-a)^2 + (y-b)^2 = r^2$' },
        { id: 'c3_3', q: '원 $(x-2)^2 + (y+3)^2 = 16$ 의 중심과 반지름', a: '중심 $(2, -3)$, 반지름 $r = 4$' },
        { id: 'c3_4', q: '점 $(x, y)$를 $x$축에 대칭이동한 좌표', a: '$(x, -y)$ ($y$부호 반대)' },
        { id: 'c3_5', q: '점 $(x, y)$를 직선 $y = x$에 대칭이동한 좌표', a: '$(y, x)$ ($x, y$ 자리 바꿈)' },
        { id: 'c3_6', q: '함수 $y = f(x)$를 $x$축으로 $+3$만큼 평행이동', a: '$y = f(x - 3)$' },
        { id: 'c3_7', q: '점 $(x, y)$를 원점에 대칭이동한 좌표', a: '$(-x, -y)$ (부호 모두 반대)' },
        { id: 'c3_8', q: '두 점 $(x_1, y_1), (x_2, y_2)$의 중점 좌표', a: '$(\frac{x_1+x_2}{2}, \frac{y_1+y_2}{2})$' }
      ]
    },
    {
      id: 'ch4',
      title: '④ 집합 · 명제 · 함수',
      pairs: [
        { id: 'c4_1', q: '드모르간의 법칙 $(A \cup B)^C$', a: '$A^C \cap B^C$' },
        { id: 'c4_2', q: '합집합의 원소 개수 $n(A \cup B)$', a: '$n(A) + n(B) - n(A \cap B)$' },
        { id: 'c4_3', q: '원소가 $n$개인 집합의 부분집합 개수', a: '$2^n$ 개' },
        { id: 'c4_4', q: '명제 $p \to q$ 와 참·거짓이 항상 같은 명제', a: '대우 ($\sim q \to \sim p$)' },
        { id: 'c4_5', q: '양수 $a, b > 0$ 산술·기하평균 절대부등식', a: '$a + b \ge 2\sqrt{ab}$' },
        { id: 'c4_6', q: '역함수 $y = f^{-1}(x)$의 그래프와 대칭인 직선', a: '직선 $y = x$' },
        { id: 'c4_7', q: '합성함수의 역함수 $(g \circ f)^{-1}$', a: '$f^{-1} \circ g^{-1}$ (순서 반대)' },
        { id: 'c4_8', q: '역함수가 존재하기 위한 함수의 조건', a: '일대일대응' }
      ]
    },
    {
      id: 'ch5',
      title: '⑤ 경우의 수 · 순열 · 조합',
      pairs: [
        { id: 'c5_1', q: '$0!$ 과 $_n\text{C}_0$ 의 값', a: '$1$' },
        { id: 'c5_2', q: '조합의 성질 $_n\text{C}_r$ 과 항상 같은 것', a: '$_n\text{C}_{n-r}$' },
        { id: 'c5_3', q: '$_5\text{C}_2$ 의 계산 값', a: '$10$ ($\frac{5 \times 4}{2 \times 1}$)' },
        { id: 'c5_4', q: '$_5\text{P}_2$ 의 계산 값', a: '$20$ ($5 \times 4$)' },
        { id: 'c5_5', q: '서로 다른 $n$개에서 순서 있게 $r$개 나열', a: '순열 $_n\text{P}_r$' },
        { id: 'c5_6', q: '서로 다른 $n$개에서 순서 없이 $r$개 선택', a: '조합 $_n\text{C}_r$' },
        { id: 'c5_7', q: '$4!$ ($4 \times 3 \times 2 \times 1$) 의 값', a: '$24$' }
      ]
    }
  ];

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function offlineTeXToHtml(tex) {
    let s = escapeHtml(tex.trim());
    s = s.replace(/\\text\{([^{}]+)\}/g, '<span class="m-fn">$1</span>');
    for (let i = 0; i < 3; i++) {
      s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="m-frac"><span class="m-num">$1</span><span class="m-den">$2</span></span>');
    }
    s = s.replace(/\\sqrt\{([^{}]+)\}/g, '<span class="m-sqrt">√<span class="m-rad">$1</span></span>');
    s = s.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
    s = s.replace(/\^([0-9a-zA-Z+-])/g, '<sup>$1</sup>');
    s = s.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
    s = s.replace(/_([0-9a-zA-Z+-])/g, '<sub>$1</sub>');

    const symbols = [
      [/\\alpha\b/g, 'α'],
      [/\\beta\b/g, 'β'],
      [/\\cup\b/g, '∪'],
      [/\\cap\b/g, '∩'],
      [/\\to\b/g, '→'],
      [/\\sim\b/g, '~'],
      [/\\ge\b/g, '≥'],
      [/\\le\b/g, '≤'],
      [/\\neq\b/g, '≠'],
      [/\\times\b/g, '×'],
      [/\\cdot\b/g, '·'],
      [/\\circ\b/g, '∘']
    ];
    for (const [regex, repl] of symbols) {
      s = s.replace(regex, repl);
    }
    return `<span class="math-inline">${s}</span>`;
  }

  function renderMathText(rawText) {
    if (!rawText) return '';
    const parts = String(rawText).split(/(\$[^$]+\$)/g);
    return parts
      .map((part) => {
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          const tex = part.slice(1, -1);
          if (window.katex && typeof window.katex.renderToString === 'function') {
            try {
              return window.katex.renderToString(tex, {
                throwOnError: false,
                displayMode: false
              });
            } catch (e) {
              return offlineTeXToHtml(tex);
            }
          }
          return offlineTeXToHtml(tex);
        }
        return escapeHtml(part);
      })
      .join('');
  }

  global.KkachiMathData = {
    CHAPTERS,
    renderMathText
  };
})(window);
