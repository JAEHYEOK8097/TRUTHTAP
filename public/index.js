// 스크롤 네비게이션 기능
const sections = document.querySelectorAll('section');
const dots = document.querySelectorAll('.dot');
let currentIndex = 0;
let isScrolling = false; // 스크롤 중인지 확인

document.addEventListener('wheel', (event) => {
    if (isScrolling) return; // 스크롤 중이면 새로운 이벤트 무시

    isScrolling = true;
    if (event.deltaY > 0 && currentIndex < sections.length - 1) {
        // 아래로 스크롤
        currentIndex++;
    } else if (event.deltaY < 0 && currentIndex > 0) {
        // 위로 스크롤
        currentIndex--;
    }

    // 스크롤 애니메이션 최적화
    sections[currentIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'start' // 섹션의 시작 부분으로 이동
    });

    // 활성화된 점 변경
    updateActiveDot();

    // 스크롤 이벤트 딜레이 줄임
    setTimeout(() => {
        isScrolling = false;
    }, 400); // 딜레이를 400ms로 단축
});

// 네비게이션 점 클릭으로 섹션 이동
dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
        currentIndex = index;

        sections[currentIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

        // 활성화된 점 변경
        updateActiveDot();
    });
});

// 활성화된 점 업데이트 함수
function updateActiveDot() {
    dots.forEach((dot, index) => {
        if (index === currentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}