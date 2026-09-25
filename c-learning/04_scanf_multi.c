/* 第2回: 複数の値を入力する / 型ごとの書式指定子 */
#include <stdio.h>

int main(void)
{
    int a, b;
    double weight;
    char initial;

    printf("整数を2つ、半角スペース区切りで入力してください: ");
    scanf("%d %d", &a, &b);
    printf("合計: %d\n", a + b);

    printf("体重(小数OK)を入力してください: ");
    scanf("%lf", &weight);          /* double の入力は %lf */
    printf("体重: %.1f kg\n", weight);

    printf("イニシャルを1文字入力してください: ");
    scanf(" %c", &initial);         /* 前の空白を読み飛ばすため先頭にスペース */
    printf("イニシャル: %c\n", initial);

    return 0;
}
