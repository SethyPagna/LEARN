export interface Question {
  id: string
  question: string
  choices: { id: string; text: string }[]
  correctAnswerId: string
  topic: string
}

export const quizQuestions: Question[] = [
  // Algorithms Questions
  {
    id: "1",
    question: "What is the time complexity of binary search?",
    choices: [
      { id: "a", text: "O(n)" },
      { id: "b", text: "O(log n)" },
      { id: "c", text: "O(n²)" },
      { id: "d", text: "O(1)" },
    ],
    correctAnswerId: "b",
    topic: "Algorithms",
  },
  {
    id: "2",
    question: "Which sorting algorithm has the best average-case time complexity?",
    choices: [
      { id: "a", text: "Bubble Sort - O(n²)" },
      { id: "b", text: "Insertion Sort - O(n²)" },
      { id: "c", text: "Quick Sort - O(n log n)" },
      { id: "d", text: "Selection Sort - O(n²)" },
    ],
    correctAnswerId: "c",
    topic: "Algorithms",
  },
  {
    id: "3",
    question: "What is the worst-case time complexity of Quick Sort?",
    choices: [
      { id: "a", text: "O(n log n)" },
      { id: "b", text: "O(n)" },
      { id: "c", text: "O(n²)" },
      { id: "d", text: "O(log n)" },
    ],
    correctAnswerId: "c",
    topic: "Algorithms",
  },
  {
    id: "4",
    question: "Which algorithm is used to find the shortest path in a weighted graph?",
    choices: [
      { id: "a", text: "Depth-First Search (DFS)" },
      { id: "b", text: "Breadth-First Search (BFS)" },
      { id: "c", text: "Dijkstra's Algorithm" },
      { id: "d", text: "Binary Search" },
    ],
    correctAnswerId: "c",
    topic: "Algorithms",
  },
  {
    id: "5",
    question: "What technique does Merge Sort use?",
    choices: [
      { id: "a", text: "Greedy approach" },
      { id: "b", text: "Dynamic programming" },
      { id: "c", text: "Divide and conquer" },
      { id: "d", text: "Backtracking" },
    ],
    correctAnswerId: "c",
    topic: "Algorithms",
  },
  {
    id: "6",
    question: "What is the time complexity of accessing an element in an array by index?",
    choices: [
      { id: "a", text: "O(n)" },
      { id: "b", text: "O(log n)" },
      { id: "c", text: "O(n²)" },
      { id: "d", text: "O(1)" },
    ],
    correctAnswerId: "d",
    topic: "Algorithms",
  },

  // Data Structures Questions
  {
    id: "7",
    question: "Which data structure uses LIFO (Last In, First Out) principle?",
    choices: [
      { id: "a", text: "Queue" },
      { id: "b", text: "Array" },
      { id: "c", text: "Stack" },
      { id: "d", text: "Linked List" },
    ],
    correctAnswerId: "c",
    topic: "Data Structures",
  },
  {
    id: "8",
    question: "What is the main advantage of using a hash table?",
    choices: [
      { id: "a", text: "Ordered data storage" },
      { id: "b", text: "Constant time average lookup" },
      { id: "c", text: "Memory efficiency" },
      { id: "d", text: "Simple implementation" },
    ],
    correctAnswerId: "b",
    topic: "Data Structures",
  },
  {
    id: "9",
    question: "Which data structure is best for implementing a priority queue?",
    choices: [
      { id: "a", text: "Array" },
      { id: "b", text: "Linked List" },
      { id: "c", text: "Heap" },
      { id: "d", text: "Stack" },
    ],
    correctAnswerId: "c",
    topic: "Data Structures",
  },
  {
    id: "10",
    question: "What is the time complexity to insert at the beginning of a singly linked list?",
    choices: [
      { id: "a", text: "O(n)" },
      { id: "b", text: "O(log n)" },
      { id: "c", text: "O(n²)" },
      { id: "d", text: "O(1)" },
    ],
    correctAnswerId: "d",
    topic: "Data Structures",
  },
  {
    id: "11",
    question: "Which traversal visits nodes in the order: Left, Root, Right?",
    choices: [
      { id: "a", text: "Preorder" },
      { id: "b", text: "Inorder" },
      { id: "c", text: "Postorder" },
      { id: "d", text: "Level order" },
    ],
    correctAnswerId: "b",
    topic: "Data Structures",
  },
  {
    id: "12",
    question: "What is a balanced binary search tree?",
    choices: [
      { id: "a", text: "A tree where all leaves are at the same level" },
      { id: "b", text: "A tree where height difference between subtrees is at most 1" },
      { id: "c", text: "A tree with exactly two children per node" },
      { id: "d", text: "A tree sorted in descending order" },
    ],
    correctAnswerId: "b",
    topic: "Data Structures",
  },

  // Database Questions
  {
    id: "13",
    question: "What does SQL stand for?",
    choices: [
      { id: "a", text: "Structured Query Language" },
      { id: "b", text: "Simple Question Language" },
      { id: "c", text: "Sequential Query Logic" },
      { id: "d", text: "Standard Query Library" },
    ],
    correctAnswerId: "a",
    topic: "Databases",
  },
  {
    id: "14",
    question: "What is the purpose of an index in a database?",
    choices: [
      { id: "a", text: "To store backup data" },
      { id: "b", text: "To speed up data retrieval" },
      { id: "c", text: "To encrypt sensitive data" },
      { id: "d", text: "To validate data types" },
    ],
    correctAnswerId: "b",
    topic: "Databases",
  },
  {
    id: "15",
    question: "Which SQL clause is used to filter grouped results?",
    choices: [
      { id: "a", text: "WHERE" },
      { id: "b", text: "HAVING" },
      { id: "c", text: "FILTER" },
      { id: "d", text: "GROUP BY" },
    ],
    correctAnswerId: "b",
    topic: "Databases",
  },
  {
    id: "16",
    question: "What does ACID stand for in database transactions?",
    choices: [
      { id: "a", text: "Automated, Consistent, Isolated, Durable" },
      { id: "b", text: "Atomicity, Consistency, Isolation, Durability" },
      { id: "c", text: "Asynchronous, Concurrent, Independent, Distributed" },
      { id: "d", text: "Active, Controlled, Indexed, Dynamic" },
    ],
    correctAnswerId: "b",
    topic: "Databases",
  },
  {
    id: "17",
    question: "Which type of JOIN returns all rows from both tables?",
    choices: [
      { id: "a", text: "INNER JOIN" },
      { id: "b", text: "LEFT JOIN" },
      { id: "c", text: "RIGHT JOIN" },
      { id: "d", text: "FULL OUTER JOIN" },
    ],
    correctAnswerId: "d",
    topic: "Databases",
  },
  {
    id: "18",
    question: "What is database normalization?",
    choices: [
      { id: "a", text: "Encrypting all database fields" },
      { id: "b", text: "Organizing data to reduce redundancy" },
      { id: "c", text: "Creating backup copies of data" },
      { id: "d", text: "Converting data to a standard format" },
    ],
    correctAnswerId: "b",
    topic: "Databases",
  },

  // JavaScript Questions
  {
    id: "19",
    question: "Which of the following is NOT a primitive data type in JavaScript?",
    choices: [
      { id: "a", text: "String" },
      { id: "b", text: "Boolean" },
      { id: "c", text: "Array" },
      { id: "d", text: "Number" },
    ],
    correctAnswerId: "c",
    topic: "JavaScript",
  },
  {
    id: "20",
    question: "What is the output of: typeof null?",
    choices: [
      { id: "a", text: "null" },
      { id: "b", text: "undefined" },
      { id: "c", text: "object" },
      { id: "d", text: "boolean" },
    ],
    correctAnswerId: "c",
    topic: "JavaScript",
  },
  {
    id: "21",
    question: "What does the '===' operator do in JavaScript?",
    choices: [
      { id: "a", text: "Assigns a value" },
      { id: "b", text: "Compares values with type coercion" },
      { id: "c", text: "Compares values and types strictly" },
      { id: "d", text: "Checks if a variable exists" },
    ],
    correctAnswerId: "c",
    topic: "JavaScript",
  },
  {
    id: "22",
    question: "What is a closure in JavaScript?",
    choices: [
      { id: "a", text: "A way to close browser windows" },
      { id: "b", text: "A function with access to its outer scope" },
      { id: "c", text: "A method to end a loop" },
      { id: "d", text: "A type of error handling" },
    ],
    correctAnswerId: "b",
    topic: "JavaScript",
  },
  {
    id: "23",
    question: "Which method adds an element to the end of an array?",
    choices: [
      { id: "a", text: "push()" },
      { id: "b", text: "pop()" },
      { id: "c", text: "shift()" },
      { id: "d", text: "unshift()" },
    ],
    correctAnswerId: "a",
    topic: "JavaScript",
  },
  {
    id: "24",
    question: "What is the purpose of 'async/await' in JavaScript?",
    choices: [
      { id: "a", text: "To create synchronous code" },
      { id: "b", text: "To handle asynchronous operations more cleanly" },
      { id: "c", text: "To pause script execution permanently" },
      { id: "d", text: "To run code in parallel threads" },
    ],
    correctAnswerId: "b",
    topic: "JavaScript",
  },

  // React Questions
  {
    id: "25",
    question: "In React, what hook is used to manage component state?",
    choices: [
      { id: "a", text: "useEffect" },
      { id: "b", text: "useContext" },
      { id: "c", text: "useState" },
      { id: "d", text: "useRef" },
    ],
    correctAnswerId: "c",
    topic: "React",
  },
  {
    id: "26",
    question: "What is the Virtual DOM in React?",
    choices: [
      { id: "a", text: "A browser extension for debugging" },
      { id: "b", text: "A lightweight copy of the actual DOM" },
      { id: "c", text: "A database for storing state" },
      { id: "d", text: "A CSS framework" },
    ],
    correctAnswerId: "b",
    topic: "React",
  },
  {
    id: "27",
    question: "When does useEffect run by default?",
    choices: [
      { id: "a", text: "Only on component mount" },
      { id: "b", text: "Only on component unmount" },
      { id: "c", text: "After every render" },
      { id: "d", text: "Before every render" },
    ],
    correctAnswerId: "c",
    topic: "React",
  },
  {
    id: "28",
    question: "What is the purpose of the 'key' prop in React lists?",
    choices: [
      { id: "a", text: "To style list items" },
      { id: "b", text: "To help React identify which items changed" },
      { id: "c", text: "To sort the list alphabetically" },
      { id: "d", text: "To encrypt list data" },
    ],
    correctAnswerId: "b",
    topic: "React",
  },
  {
    id: "29",
    question: "What is prop drilling in React?",
    choices: [
      { id: "a", text: "A technique to improve performance" },
      { id: "b", text: "Passing props through many component levels" },
      { id: "c", text: "A method for form validation" },
      { id: "d", text: "A way to fetch data from APIs" },
    ],
    correctAnswerId: "b",
    topic: "React",
  },
  {
    id: "30",
    question: "Which hook would you use to share state across components without prop drilling?",
    choices: [
      { id: "a", text: "useState" },
      { id: "b", text: "useEffect" },
      { id: "c", text: "useContext" },
      { id: "d", text: "useRef" },
    ],
    correctAnswerId: "c",
    topic: "React",
  },
]
