# 12. Unique without a list

The invitation page (ADR 0021) makes links that must never repeat, and it remembers nothing. This note says why that is safe, with the sums.

## The usual way, and why not here

The usual way to hand out things that must not repeat is a list: write down each one given out, and check the list before giving the next. A list needs a place to live. On a server, the server would see every link value, which ADR 0018 forbids. In a file, the file is the very thing we do not want to exist: all the links in one place, one step from the names.

The other way is to draw each value at random from so many possibilities that a repeat does not happen. Nothing has to be remembered, so nothing can leak.

## How a value is drawn

1. The page asks the browser for 20 random bytes: `crypto.getRandomValues`. This is the browser's strong generator, the one it uses for encryption keys. It is not `Math.random`, which is predictable.
2. Each byte is a number from 0 to 255. The page keeps the remainder after dividing by 32, a number from 0 to 31. Because 256 is exactly 8 times 32, every one of the 32 results is equally likely. (With 30 or 36 letters some would come up more often than others.)
3. Each number picks one character from an alphabet of 32: the lowercase letters and the digits, without `i`, `l`, `o` and `u`.

Twenty characters, 32 choices each: 32 to the power of 20 possible values. That is about 1.3 followed by 30 zeros. In bits: 5 bits per character, 100 bits in all.

## The chance of a repeat

This is the birthday problem: in a room of 23 people, two share a birthday more often than not, because every pair is a chance. With n values out of N possibilities there are about n times n over 2 pairs, and each pair matches with a chance of 1 in N. So the chance of any repeat is about:

```
n × n ÷ 2 ÷ N
```

Take n = 450 links (150 people, three links each).

- **Two equal values.** N is 1.3 × 10^30. The chance is about 8 in 10^26. It will not happen.
- **Two values that make the same code.** This is the tighter one. The client turns a value into a 16-digit code (ADR 0018), so N is 10^16. The chance is 450 × 450 ÷ 2 ÷ 10^16, about 1 in 100 billion.

So the page can forget every value the moment it is copied.

## What the sums do not cover

They cover the page repeating itself. They do not cover a person pasting the same text into two emails. That is why the text leaves the screen after it is copied once, and why the first rule on the page is "one set for one person".

## Where it is in the code

`apps/web/src/lib/invitations.ts` draws the values and builds the links. Its tests pin the alphabet, the length and the shape of a link, and check that the three links of a set differ.
