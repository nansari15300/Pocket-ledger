
export function numToWords(num: number): string {
    const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const inWords = (n: number): string => {
        if (n < 20) return a[n];
        let digit = n % 10;
        return `${b[Math.floor(n / 10)]} ${a[digit]}`.trim();
    };
    const toWords = (n: number): string => {
        if (n === 0) return 'zero';
        const crore = Math.floor(n / 10000000);
        const lakh = Math.floor((n % 10000000) / 100000);
        const thousand = Math.floor((n % 100000) / 1000);
        const hundreds = Math.floor((n % 1000) / 100);
        const remainder = n % 100;
        let str = '';
        if (crore > 0) str += `${inWords(crore)} crore `;
        if (lakh > 0) str += `${inWords(lakh)} lakh `;
        if (thousand > 0) str += `${inWords(thousand)} thousand `;
        if (hundreds > 0) str += `${inWords(hundreds)} hundred `;
        if (remainder > 0) str += inWords(remainder);
        return str.trim();
    };
    const [integerPart, decimalPart] = num.toFixed(2).split('.').map(Number);
    let words = toWords(integerPart);
    if (decimalPart > 0) words += ` and ${toWords(decimalPart)} paisa`;
    return words.replace(/\s+/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
