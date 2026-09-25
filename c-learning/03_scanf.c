/* 第2回: キーボードからの入力(scanf) */
#include <stdio.h>

int main(void)
{
    int age;

    printf("年齢を入力してください: ");
    scanf("%d", &age);   /* &age = 「age という箱の場所」を教える */

    printf("あなたは %d 歳ですね。\n", age);
    printf("10年後は %d 歳です。\n", age + 10);

    return 0;
}
