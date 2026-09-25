/* 第1回: 変数(データを入れておく「箱」) */
#include <stdio.h>

int main(void)
{
    int age = 20;          /* int    : 整数を入れる箱 */
    double height = 170.5; /* double : 小数を入れる箱 */
    char grade = 'A';      /* char   : 1文字を入れる箱 */

    printf("年齢: %d 歳\n", age);        /* %d → 整数 */
    printf("身長: %.1f cm\n", height);   /* %f → 小数(.1 は小数1桁) */
    printf("評価: %c\n", grade);         /* %c → 1文字 */

    age = age + 1;                       /* 箱の中身は書き換えられる */
    printf("1年後の年齢: %d 歳\n", age);

    int a = 7, b = 2;
    printf("%d + %d = %d\n", a, b, a + b);
    printf("%d / %d = %d (整数どうしの割り算は小数が切り捨て)\n", a, b, a / b);
    printf("%d %% %d = %d (%% は割り算のあまり)\n", a, b, a % b);
    return 0;
}
