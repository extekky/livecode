# Перевод числа в СС с основанием base
def perevod(n, base):
    r = ''
    while n  > 0:
        r = str(n % base) + r 
        n = n // base 
    return r 

print(perevod(10, 2))
