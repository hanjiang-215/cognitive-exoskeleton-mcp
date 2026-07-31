# Neural Networks & Deep Learning Notes

## Artificial Neurons and Perceptrons

An artificial neuron computes a weighted sum of its inputs, adds a bias term,
and passes the result through an activation function. The perceptron, invented
by Frank Rosenblatt in 1958, is the simplest form of an artificial neuron used
for binary classification.

## Backpropagation

Backpropagation is the cornerstone algorithm for training neural networks. It
computes the gradient of the loss function with respect to each weight by
applying the chain rule of calculus layer by layer, from output to input.

Key concepts:
- **Chain rule**: Enables efficient gradient computation through composition
- **Vanishing gradients**: In deep networks, gradients can become exponentially small, preventing learning in early layers
- **Gradient clipping**: A technique to prevent exploding gradients

## Convolutional Neural Networks (CNNs)

CNNs use convolutional layers to automatically learn spatial hierarchies of features.
They are particularly effective for image recognition tasks.

Architecture patterns:
- **Convolutional layer**: Applies learnable filters to detect local patterns
- **Pooling layer**: Reduces spatial dimensions (max pooling, average pooling)
- **Fully connected layer**: Final classification layers
- **ResNet (Residual Networks)**: Skip connections to address vanishing gradients in very deep networks

## Recurrent Neural Networks (RNNs)

RNNs process sequential data by maintaining a hidden state that captures information
from previous time steps. Variants include:

- **LSTM (Long Short-Term Memory)**: Uses gates (input, forget, output) to control information flow, addressing the vanishing gradient problem
- **GRU (Gated Recurrent Unit)**: A simplified variant of LSTM with fewer parameters
- **Bidirectional RNNs**: Process sequences in both directions for richer context

## Attention Mechanism

The attention mechanism allows models to focus on relevant parts of the input
when producing output. The **Transformer** architecture (Vaswani et al., 2017)
replaced recurrence entirely with self-attention, enabling massive parallelization
and becoming the foundation for modern LLMs.

Self-attention computes:
```
Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) V
```

## Connection to Biological Neural Networks

Artificial neural networks are loosely inspired by biological neural networks:
- **Neurons** ≈ biological neurons
- **Weights/synapses** ≈ synaptic strengths
- **Layers** ≈ cortical layers
- **Backpropagation** ≈ (controversial) biological learning mechanism

However, modern ANNs differ significantly from biological brains in architecture,
scale, and learning mechanisms. The relationship between ANN learning and biological
plausibility remains an active research area.