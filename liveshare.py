with open("24_21717.txt", "r") as file:
	data = file.readline()

notEnd = 'Q'
repeat = 130
subStr = 'RSQ'

lenSubStr = len(subStr)
lenData = len(data)

# Поиск позиций букв R в подстроках RSQ
indexes = []
for i in range(len(data) - lenSubStr + 1):
	if data[i : i + lenSubStr] == subStr:
		indexes.append(i)

minLen = float("inf")
for i in range(len(indexes) - repeat + 1):

	bgn = indexes[i]  # begin 
	end = indexes[i + repeat - 1]

	# trueEnd это "настоящий" индекс последнего элемента 
	# в подсписке, который не оканчивается на "Q". 
	# Например: RSQQQT выдаст позицию "T" (то есть 5)
	trueEnd = end + lenSubStr - 1
	while trueEnd < lenData and data[trueEnd] == notEnd:
		trueEnd += 1

	# Если дошли до конца data, значит так и не нашли
	# настоящий конечный индекс, значит скипаем такое
	if trueEnd == lenData:
		continue

	# Формирум кандидатов на искомый подсписок min длинны
	temp = data[bgn : trueEnd + 1]
	lenTemp = len(temp) 

	if lenTemp < minLen:  # находим минимальную длинну
		minLen = lenTemp

print(minLen)










